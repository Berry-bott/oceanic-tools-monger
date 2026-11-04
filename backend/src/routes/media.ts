import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { cleanupTrackedMedia, createMediaUploadMiddleware, createTrackedMedia, type MediaPurpose } from "../lib/media-storage.js";

export const mediaRouter = Router();
const mediaRoles = ["OWNER", "STAFF"] as const;
mediaRouter.use(requireAuth, requireRoles(...mediaRoles));

const purposes = {
  "course-videos": "COURSE_VIDEO",
  "course-documents": "COURSE_DOCUMENT",
} as const satisfies Record<string, MediaPurpose>;

async function uploadCourseMedia(purpose: MediaPurpose, request: Request, response: Response) {
  const parsed = z.object({ courseId: z.string().trim().min(1).max(255) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Provide the courseId multipart field.", "INVALID_MEDIA_OWNER", parsed.error.issues);
  if (!request.file) throw new ApiError(400, "Provide a file in the multipart field named file.", "MEDIA_FILE_REQUIRED");
  const auth = response.locals.auth as AuthContext;
  const uploaded = await createTrackedMedia({ businessId: auth.businessId, purpose, ownerId: parsed.data.courseId, file: request.file });
  try {
    const asset = await prisma.$transaction(async (transaction) => {
      const saved = await transaction.mediaAsset.update({ where: { id: uploaded.asset.id }, data: { secureUrl: uploaded.secureUrl, status: "ACTIVE" } });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "MEDIA_ASSET_CREATED", entityType: "MediaAsset", entityId: saved.id, after: { purpose, resourceType: saved.resourceType, publicId: saved.publicId } });
      return saved;
    });
    response.status(201).json({ data: asset });
  } catch (error) {
    await cleanupTrackedMedia(uploaded.asset, "Could not clean up a Cloudinary asset after its database update failed.");
    throw error;
  }
}

for (const [path, purpose] of Object.entries(purposes)) {
  const fieldName = "file";
  const upload = createMediaUploadMiddleware(purpose, fieldName);
  mediaRouter.post(`/${path}`, upload, async (request, response) => uploadCourseMedia(purpose, request, response));
  mediaRouter.put(`/${path}/:assetId`, upload, async (request, response) => {
    const auth = response.locals.auth as AuthContext;
    const existing = await prisma.mediaAsset.findFirst({ where: { id: request.params.assetId as string, businessId: auth.businessId, purpose } });
    if (!existing) throw new ApiError(404, "Media asset not found.", "MEDIA_ASSET_NOT_FOUND");
    if (existing.status !== "ACTIVE") throw new ApiError(409, "This asset is already pending cleanup and cannot be replaced.", "MEDIA_ASSET_NOT_ACTIVE");
    if (!request.file) throw new ApiError(400, "Provide a file in the multipart field named file.", "MEDIA_FILE_REQUIRED");
    const uploaded = await createTrackedMedia({ businessId: auth.businessId, purpose, ownerId: existing.ownerId ?? undefined, file: request.file });
    try {
      await prisma.$transaction(async (transaction) => {
        await transaction.mediaAsset.update({ where: { id: uploaded.asset.id }, data: { secureUrl: uploaded.secureUrl, status: "ACTIVE" } });
        const markedOld = await transaction.mediaAsset.updateMany({ where: { id: existing.id, status: "ACTIVE" }, data: { status: "DELETE_PENDING" } });
        if (markedOld.count !== 1) throw new ApiError(409, "This asset changed while it was being replaced. Reload and retry.", "MEDIA_ASSET_CONFLICT");
        await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "MEDIA_ASSET_REPLACED", entityType: "MediaAsset", entityId: uploaded.asset.id, before: { replacedAssetId: existing.id }, after: { purpose, resourceType: uploaded.asset.resourceType, publicId: uploaded.asset.publicId } });
      });
    } catch (error) {
      await cleanupTrackedMedia(uploaded.asset, "Could not clean up a replacement Cloudinary asset after its database update failed.");
      throw error;
    }
    const removed = await cleanupTrackedMedia(existing, "Could not delete the replaced Cloudinary asset.");
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: uploaded.asset.id } });
    response.json({ data: asset, oldAssetDeleted: removed });
  });
}

mediaRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const data = await prisma.mediaAsset.findMany({ where: { businessId: auth.businessId, ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 200 });
  response.json({ data });
});

mediaRouter.delete("/:assetId", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const asset = await prisma.mediaAsset.findFirst({ where: { id: request.params.assetId as string, businessId: auth.businessId } });
  if (!asset) throw new ApiError(404, "Media asset not found.", "MEDIA_ASSET_NOT_FOUND");
  await prisma.$transaction(async (transaction) => {
    const productImage = await transaction.productImage.findUnique({ where: { mediaAssetId: asset.id } });
    if (productImage) {
      await transaction.productImage.delete({ where: { id: productImage.id } });
      await transaction.product.update({ where: { id: productImage.productId }, data: { ...(productImage.view === "FRONT" ? { imageUrl: null, imagePublicId: null } : {}), ...(["FRONT", "BACK", "SIDE"].includes(productImage.view) ? { isPublished: false } : {}) } });
    }
    if (asset.productId) await transaction.product.updateMany({ where: { id: asset.productId, businessId: auth.businessId, imagePublicId: asset.publicId }, data: { imageUrl: null, imagePublicId: null } });
    await transaction.mediaAsset.update({ where: { id: asset.id }, data: { status: "DELETE_PENDING" } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "MEDIA_ASSET_DELETE_REQUESTED", entityType: "MediaAsset", entityId: asset.id, before: { publicId: asset.publicId, status: asset.status } });
  });
  const deleted = await cleanupTrackedMedia(asset, "Cloudinary asset deletion is pending and remains tracked for retry.");
  response.json({ data: { id: asset.id, deleted, status: deleted ? "DELETED" : "DELETE_PENDING" } });
});
