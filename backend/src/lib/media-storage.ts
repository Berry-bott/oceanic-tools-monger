import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import multer from "multer";
import type { MediaAsset } from "@prisma/client";
import { ApiError } from "./errors.js";
import { prisma } from "./prisma.js";
import { getCloudinary } from "./cloudinary.js";
import { safeErrorMetadata } from "./safe-error.js";

export type MediaPurpose = "PRODUCT_IMAGE" | "COURSE_VIDEO" | "COURSE_DOCUMENT";
type ResourceType = "image" | "video" | "raw";
type MediaSpec = { resourceType: ResourceType; folder: (businessId: string) => string; maxBytes: number; mimeTypes: Set<string> };
const maxLimits = { image: 20 * 1024 * 1024, video: 100 * 1024 * 1024, document: 25 * 1024 * 1024 };
function configuredLimit(name: string, fallback: number, ceiling: number) {
  const value = process.env[name];
  if (!value) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > ceiling) throw new Error(`${name} must be a positive byte count no larger than ${ceiling}.`);
  return Number(value);
}

export const mediaSpecs: Record<MediaPurpose, MediaSpec> = {
  PRODUCT_IMAGE: { resourceType: "image", folder: (businessId) => `oceanic-tools/${businessId}/products/images`, maxBytes: configuredLimit("CLOUDINARY_IMAGE_MAX_BYTES", 5 * 1024 * 1024, maxLimits.image), mimeTypes: new Set(["image/jpeg", "image/png", "image/webp"]) },
  COURSE_VIDEO: { resourceType: "video", folder: (businessId) => `oceanic-tools/${businessId}/courses/videos`, maxBytes: configuredLimit("CLOUDINARY_VIDEO_MAX_BYTES", 50 * 1024 * 1024, maxLimits.video), mimeTypes: new Set(["video/mp4", "video/webm"]) },
  COURSE_DOCUMENT: { resourceType: "raw", folder: (businessId) => `oceanic-tools/${businessId}/courses/documents`, maxBytes: configuredLimit("CLOUDINARY_DOCUMENT_MAX_BYTES", 10 * 1024 * 1024, maxLimits.document), mimeTypes: new Set(["application/pdf"]) },
};

export function createMediaUploadMiddleware(purpose: MediaPurpose, fieldName: string) {
  const spec = mediaSpecs[purpose];
  const parser = multer({ storage: multer.memoryStorage(), limits: { fileSize: spec.maxBytes, files: 1, fields: 2 } }).single(fieldName);
  return (request: Parameters<typeof parser>[0], response: Parameters<typeof parser>[1], next: Parameters<typeof parser>[2]) => parser(request, response, (error) => {
    if (error instanceof multer.MulterError) {
      next(new ApiError(error.code === "LIMIT_FILE_SIZE" ? 413 : 400, `Upload one supported ${purpose.toLowerCase().replace("_", " ")} file no larger than ${spec.maxBytes} bytes.`, "INVALID_MEDIA_UPLOAD"));
      return;
    }
    next(error);
  });
}

export function validateMediaBytes(purpose: MediaPurpose, file: Express.Multer.File) {
  const spec = mediaSpecs[purpose];
  if (file.size > spec.maxBytes) throw new ApiError(413, `File exceeds the configured ${spec.maxBytes}-byte limit.`, "MEDIA_FILE_TOO_LARGE");
  if (!spec.mimeTypes.has(file.mimetype)) throw new ApiError(415, "This media type is not supported.", "UNSUPPORTED_MEDIA_TYPE");
  const bytes = file.buffer;
  const valid = purpose === "PRODUCT_IMAGE"
    ? (file.mimetype === "image/jpeg" && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
      || (file.mimetype === "image/png" && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      || (file.mimetype === "image/webp" && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP")
    : purpose === "COURSE_VIDEO"
      ? (file.mimetype === "video/mp4" && bytes.length >= 12 && bytes.toString("ascii", 4, 8) === "ftyp")
        || (file.mimetype === "video/webm" && bytes.length >= 4 && bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
      : file.mimetype === "application/pdf" && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  if (!valid) throw new ApiError(400, "The file contents do not match the declared media type.", "INVALID_MEDIA_CONTENT");
}

export function safeOriginalFilename(filename: string) {
  return filename.replace(/\\/g, "/").split("/").pop()?.replace(/[^\p{L}\p{N}._ ()-]/gu, "_").slice(0, 255) || "upload";
}

export async function createTrackedMedia(params: { businessId: string; productId?: string; purpose: MediaPurpose; ownerId?: string; file: Express.Multer.File }) {
  validateMediaBytes(params.purpose, params.file);
  let cloudinaryClient: ReturnType<typeof getCloudinary>;
  try {
    cloudinaryClient = getCloudinary();
  } catch (error) {
    console.error("Cloudinary media storage is not configured.", safeErrorMetadata(error));
    throw new ApiError(503, "Product image storage is not configured. Contact support.", "CLOUDINARY_NOT_CONFIGURED");
  }
  const spec = mediaSpecs[params.purpose];
  const folder = spec.folder(params.businessId);
  const extension = params.file.mimetype === "application/pdf" ? ".pdf" : "";
  const publicId = `${folder}/${randomUUID()}${spec.resourceType === "raw" ? extension : ""}`;
  const asset = await prisma.mediaAsset.create({ data: {
    businessId: params.businessId,
    productId: params.productId,
    purpose: params.purpose,
    resourceType: spec.resourceType,
    folder,
    publicId,
    originalFilename: safeOriginalFilename(params.file.originalname),
    mimeType: params.file.mimetype,
    ...(params.ownerId ? { ownerId: params.ownerId } : {}),
  } });
  let uploadedAsset: { secureUrl: string; publicId: string } | undefined;
  try {
    const uploaded = await new Promise<{ secureUrl: string; publicId: string }>((resolve, reject) => {
      const stream = cloudinaryClient.uploader.upload_stream({
        folder,
        public_id: publicId.split("/").pop(),
        resource_type: spec.resourceType,
        ...(spec.resourceType === "image" ? { allowed_formats: ["jpg", "jpeg", "png", "webp"], transformation: [{ width: 1200, height: 1200, crop: "limit" }, { quality: "auto", fetch_format: "auto" }] } : {}),
      }, (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary returned no upload result."));
        else resolve({ secureUrl: result.secure_url, publicId: result.public_id });
      });
      Readable.from([params.file.buffer]).pipe(stream);
    });
    uploadedAsset = uploaded;
    const trackedAsset = await prisma.mediaAsset.update({ where: { id: asset.id }, data: { publicId: uploaded.publicId, secureUrl: uploaded.secureUrl, status: "UPLOADED" } });
    return { asset: trackedAsset, secureUrl: uploaded.secureUrl };
  } catch (error) {
    await cleanupTrackedMedia(uploadedAsset ? { ...asset, ...uploadedAsset } : asset, "Upload failed before Cloudinary returned a completed asset.");
    console.error("Cloudinary media upload failed.", { mediaAssetId: asset.id, ...safeErrorMetadata(error) });
    const timeout = error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name);
    throw new ApiError(
      timeout ? 504 : 502,
      timeout ? "Image storage took too long to respond. Try again." : "Image storage could not save this file. Try again.",
      timeout ? "CLOUDINARY_TIMEOUT" : "CLOUDINARY_UPLOAD_FAILED",
    );
  }
}

export async function cleanupTrackedMedia(asset: Pick<MediaAsset, "id" | "publicId" | "resourceType"> & Partial<Pick<MediaAsset, "secureUrl">>, reason: string) {
  try {
    await prisma.mediaAsset.updateMany({ where: { id: asset.id }, data: { status: "DELETE_PENDING", publicId: asset.publicId, ...(asset.secureUrl ? { secureUrl: asset.secureUrl } : {}) } });
  } catch (error) {
    console.error(`${reason} Could not persist the pending-delete status.`, { mediaAssetId: asset.id, publicId: asset.publicId, resourceType: asset.resourceType, errorType: error instanceof Error ? error.name : "unknown" });
    return false;
  }
  try {
    const result = await getCloudinary().uploader.destroy(asset.publicId, { resource_type: asset.resourceType as ResourceType });
    if (result.result !== "ok" && result.result !== "not found") throw new Error(`Cloudinary destroy returned ${result.result}.`);
    await prisma.mediaAsset.delete({ where: { id: asset.id } });
    return true;
  } catch (error) {
    console.error(reason, { mediaAssetId: asset.id, publicId: asset.publicId, resourceType: asset.resourceType, errorType: error instanceof Error ? error.name : "unknown" });
    return false;
  }
}
