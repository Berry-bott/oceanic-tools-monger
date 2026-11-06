import { Prisma, ProductState } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry } from "../lib/accounting.js";
import ExcelJS from "exceljs-hardened";
import type { Workbook as WorkbookType } from "exceljs-hardened";
import { createMediaUploadMiddleware, createTrackedMedia, cleanupTrackedMedia } from "../lib/media-storage.js";

export const productsRouter = Router();
const { Workbook, ValueType } = ExcelJS;
const createProductSchema = z.object({
  sku: z.string().trim().min(1).max(80).transform((value) => value.toLocaleUpperCase("en-US")),
  barcode: z.string().trim().max(80).optional().or(z.literal("")).transform((value) => value?.toLocaleUpperCase("en-US")),
  name: z.string().trim().min(1).max(180),
  description: z.string().trim().max(5000).optional(),
  brand: z.string().trim().min(1).max(120),
  model: z.string().trim().max(120).optional().or(z.literal("")),
  specifications: z.array(z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500) })).max(50).default([]),
  quantity: z.coerce.number().min(0).max(1_000_000),
  publishOnSave: z.boolean().default(true),
  branchAssignments: z.array(z.object({ branchId: z.string().min(1), openingStock: z.coerce.number().min(0).max(1_000_000).default(0) })).max(100).optional(),
  category: z.string().trim().min(1).max(100),
  categoryId: z.string().min(1).optional(),
  subcategoryId: z.string().min(1).optional(),
  subcategory: z.string().trim().min(1).max(100).optional(),
  unit: z.string().trim().min(1).max(40).default("piece"),
  costPrice: z.coerce.number().min(0),
  sellingPrice: z.coerce.number().min(0),
  reorderLevel: z.coerce.number().min(0).default(0),
});
const updateProductSchema = createProductSchema.omit({ specifications: true, branchAssignments: true, quantity: true, publishOnSave: true }).partial().extend({
  categoryId: z.string().min(1).nullable().optional(),
  subcategoryId: z.string().min(1).nullable().optional(),
  specifications: z.array(z.object({ name: z.string().trim().min(1).max(100), value: z.string().trim().min(1).max(500) })).max(50).optional(),
  state: z.enum(["DRAFT", "ACTIVE", "INACTIVE", "ARCHIVED"]).optional(),
  isPublished: z.boolean().optional(),
});
const adjustStockSchema = z.object({
  branchId: z.string().min(1),
  quantity: z.coerce.number().refine((value) => value !== 0, "Quantity cannot be zero."),
  reason: z.string().trim().min(3).max(500),
});
const inventoryRoles = ["OWNER", "STAFF"] as const;
const productImageUpload = createMediaUploadMiddleware("PRODUCT_IMAGE", "image");
const normalizeName = (value: string) => value.toLocaleLowerCase("en-NG").normalize("NFKC").trim().replace(/\s+/g, " ").replace(/\s*(\d)\s*(kg|g|ml|l|cl)\b/gi, "$1$2");
const importRowSchema = createProductSchema.omit({ quantity: true, publishOnSave: true }).extend({ openingStock: z.coerce.number().min(0).max(1_000_000), duplicateOverrideReason: z.string().trim().min(5).max(500).optional() });

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let afterQuote = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index++; }
      else if (char === '"') { quoted = false; afterQuote = true; }
      else field += char;
    } else if (char === '"') {
      if (field.length || afterQuote) throw new ApiError(400, "Malformed CSV: quote found inside an unquoted field.", "INVALID_CSV");
      quoted = true;
    } else if (char === ",") { row.push(field); field = ""; afterQuote = false; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(field); field = "";
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = []; afterQuote = false;
    } else if (afterQuote && !/\s/.test(char)) throw new ApiError(400, "Malformed CSV: unexpected text after a quoted field.", "INVALID_CSV");
    else if (!afterQuote) field += char;
  }
  if (quoted) throw new ApiError(400, "Malformed CSV: an enclosed field is not closed.", "INVALID_CSV");
  row.push(field);
  if (row.some((cell) => cell.trim())) rows.push(row);
  if (rows.length < 2 || rows.length > 5001) throw new ApiError(400, "CSV must contain a header and between 1 and 5,000 product rows.", "INVALID_CSV_ROW_COUNT");
  const allowed = new Set(["sku", "barcode", "name", "description", "category", "subcategory", "unit", "costprice", "sellingprice", "reorderlevel", "quantity", "openingstock", "duplicateoverridereason"]);
  const headers = rows[0].map((header, index) => header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[ _-]/g, ""));
  if (headers.some((header) => !header || !allowed.has(header)) || new Set(headers).size !== headers.length) throw new ApiError(400, "CSV headers must be unique and use supported product fields.", "INVALID_CSV_HEADERS");
  for (const required of ["sku", "name", "category", "sellingprice"]) if (!headers.includes(required)) throw new ApiError(400, `CSV is missing the required ${required} column.`, "INVALID_CSV_HEADERS");
  if (!headers.includes("quantity") && !headers.includes("openingstock")) throw new ApiError(400, "CSV is missing the required quantity column.", "INVALID_CSV_HEADERS");
  if (rows.slice(1).some((item) => item.length !== headers.length)) throw new ApiError(400, "Every CSV row must have the same number of columns as the header.", "INVALID_CSV_COLUMNS");
  const keyName = (header: string) => ({ costprice: "costPrice", sellingprice: "sellingPrice", reorderlevel: "reorderLevel", quantity: "openingStock", openingstock: "openingStock", duplicateoverridereason: "duplicateOverrideReason" }[header] ?? header);
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [keyName(header), cells[index].trim()]).filter(([, value]) => value !== "")));
}

async function parseXlsx(buffer: Buffer) {
  let workbook: WorkbookType;
  try {
    workbook = await new Workbook().xlsx.load(buffer as unknown as Parameters<WorkbookType["xlsx"]["load"]>[0], {
      maxEntryUncompressedSize: 16 * 1024 * 1024,
      maxTotalUncompressedSize: 64 * 1024 * 1024,
      maxMergeCells: 100_000,
      maxDataValidationCells: 100_000,
    });
  } catch {
    throw new ApiError(400, "The XLSX workbook is invalid or exceeds the supported size limits.", "INVALID_XLSX");
  }
  if (workbook.worksheets.length !== 1) throw new ApiError(400, "The XLSX file must contain exactly one worksheet.", "INVALID_XLSX_SHEETS");
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 5001 || sheet.columnCount > 20) throw new ApiError(400, "The worksheet must contain a header and 1 to 5,000 product rows across no more than 20 columns.", "INVALID_XLSX_DIMENSIONS");
  const rows: string[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount > 20) throw new ApiError(400, "The worksheet cannot contain more than 20 columns.", "INVALID_XLSX_DIMENSIONS");
    const cells: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) {
      const cell = row.getCell(column);
      if (cell.type === ValueType.Formula || cell.type === ValueType.Error || cell.type === ValueType.Hyperlink || cell.type === ValueType.RichText || cell.type === ValueType.Merge) {
        throw new ApiError(400, "Formula, error, rich-text, hyperlink, and merged cells are not supported in product imports.", "INVALID_XLSX_CELL");
      }
      const value = cell.value;
      if (value !== null && value !== undefined && typeof value !== "string" && typeof value !== "number") {
        throw new ApiError(400, "Product import cells must contain plain text or numbers.", "INVALID_XLSX_CELL");
      }
      cells.push(value === null || value === undefined ? "" : String(value));
    }
    if (cells.some((value) => value.trim())) rows.push(cells);
  }
  if (rows.length < 2 || rows.length > 5001) throw new ApiError(400, "The worksheet must contain a header and 1 to 5,000 product rows.", "INVALID_XLSX_ROW_COUNT");
  const allowed = new Set(["sku", "barcode", "name", "description", "category", "subcategory", "unit", "costprice", "sellingprice", "reorderlevel", "quantity", "openingstock", "duplicateoverridereason"]);
  const headers = rows[0].map((header) => header.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/[ _-]/g, ""));
  if (headers.some((header) => !header || !allowed.has(header)) || new Set(headers).size !== headers.length) throw new ApiError(400, "XLSX headers must be unique and use supported product fields.", "INVALID_XLSX_HEADERS");
  for (const required of ["sku", "name", "category", "sellingprice"]) if (!headers.includes(required)) throw new ApiError(400, `XLSX is missing the required ${required} column.`, "INVALID_XLSX_HEADERS");
  if (!headers.includes("quantity") && !headers.includes("openingstock")) throw new ApiError(400, "XLSX is missing the required quantity column.", "INVALID_XLSX_HEADERS");
  if (rows.slice(1).some((row) => row.length !== headers.length)) throw new ApiError(400, "Every XLSX row must have the same number of columns as the header.", "INVALID_XLSX_COLUMNS");
  const keyName = (header: string) => ({ costprice: "costPrice", sellingprice: "sellingPrice", reorderlevel: "reorderLevel", quantity: "openingStock", openingstock: "openingStock", duplicateoverridereason: "duplicateOverrideReason" }[header] ?? header);
  return rows.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [keyName(header), cells[index].trim()]).filter(([, value]) => value !== "")));
}

productsRouter.use(requireAuth);

productsRouter.get("/categories", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const data = await prisma.category.findMany({ where: { businessId: auth.businessId }, include: { subcategories: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
  response.json({ data });
});

productsRouter.post("/categories", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({
    name: z.string().trim().min(1).max(100),
    subcategoryName: z.string().trim().max(100).optional().or(z.literal("")),
  }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a category name and, if needed, a subcategory name up to 100 characters.", "INVALID_CATEGORY", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const normalizedName = parsed.data.name.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
  const existing = await prisma.category.findUnique({ where: { businessId_normalizedName: { businessId: auth.businessId, normalizedName } } });
  if (existing) throw new ApiError(409, "This category already exists.", "CATEGORY_EXISTS");
  const subcategoryName = parsed.data.subcategoryName?.trim();
  const data = await prisma.category.create({
    data: {
      businessId: auth.businessId,
      name: parsed.data.name,
      normalizedName,
      ...(subcategoryName ? {
        subcategories: {
          create: {
            name: subcategoryName,
            normalizedName: subcategoryName.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " "),
          },
        },
      } : {}),
    },
    include: { subcategories: { orderBy: { name: "asc" } } },
  });
  response.status(201).json({ data });
});

productsRouter.patch("/categories/:categoryId", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a category name up to 100 characters.", "INVALID_CATEGORY", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const categoryId = request.params.categoryId as string;
  const current = await prisma.category.findFirst({ where: { id: categoryId, businessId: auth.businessId }, select: { id: true } });
  if (!current) throw new ApiError(404, "Category not found.", "CATEGORY_NOT_FOUND");
  const normalizedName = parsed.data.name.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
  const collision = await prisma.category.findFirst({ where: { businessId: auth.businessId, normalizedName, id: { not: categoryId } }, select: { id: true } });
  if (collision) throw new ApiError(409, "This category already exists.", "CATEGORY_EXISTS");
  const data = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.category.update({ where: { id: categoryId }, data: { name: parsed.data.name, normalizedName } });
    await transaction.product.updateMany({ where: { businessId: auth.businessId, categoryId }, data: { category: parsed.data.name } });
    return updated;
  });
  response.json({ data });
});

productsRouter.delete("/categories/:categoryId", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const categoryId = request.params.categoryId as string;
  const category = await prisma.category.findFirst({ where: { id: categoryId, businessId: auth.businessId }, include: { _count: { select: { products: true, subcategories: true } } } });
  if (!category) throw new ApiError(404, "Category not found.", "CATEGORY_NOT_FOUND");
  if (category._count.products || category._count.subcategories) throw new ApiError(409, "Move its products and remove its subcategories before deleting this category.", "CATEGORY_IN_USE");
  await prisma.category.delete({ where: { id: categoryId } });
  response.status(204).end();
});

productsRouter.post("/categories/:categoryId/subcategories", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a subcategory name up to 100 characters.", "INVALID_SUBCATEGORY", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const category = await prisma.category.findFirst({ where: { id: request.params.categoryId as string, businessId: auth.businessId }, select: { id: true } });
  if (!category) throw new ApiError(404, "Category not found.", "CATEGORY_NOT_FOUND");
  const normalizedName = parsed.data.name.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
  const existing = await prisma.subcategory.findUnique({ where: { categoryId_normalizedName: { categoryId: category.id, normalizedName } } });
  if (existing) throw new ApiError(409, "This subcategory already exists in this category.", "SUBCATEGORY_EXISTS");
  const data = await prisma.subcategory.create({ data: { categoryId: category.id, name: parsed.data.name, normalizedName } });
  response.status(201).json({ data });
});

productsRouter.patch("/categories/:categoryId/subcategories/:subcategoryId", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(100) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a subcategory name up to 100 characters.", "INVALID_SUBCATEGORY", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const categoryId = request.params.categoryId as string;
  const subcategoryId = request.params.subcategoryId as string;
  const subcategory = await prisma.subcategory.findFirst({ where: { id: subcategoryId, categoryId, category: { businessId: auth.businessId } }, select: { id: true } });
  if (!subcategory) throw new ApiError(404, "Subcategory not found.", "SUBCATEGORY_NOT_FOUND");
  const normalizedName = parsed.data.name.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
  const collision = await prisma.subcategory.findFirst({ where: { categoryId, normalizedName, id: { not: subcategoryId } }, select: { id: true } });
  if (collision) throw new ApiError(409, "This subcategory already exists in this category.", "SUBCATEGORY_EXISTS");
  const data = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.subcategory.update({ where: { id: subcategoryId }, data: { name: parsed.data.name, normalizedName } });
    await transaction.product.updateMany({ where: { businessId: auth.businessId, subcategoryId }, data: { subcategory: parsed.data.name } });
    return updated;
  });
  response.json({ data });
});

productsRouter.delete("/categories/:categoryId/subcategories/:subcategoryId", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const subcategoryId = request.params.subcategoryId as string;
  const subcategory = await prisma.subcategory.findFirst({ where: { id: subcategoryId, categoryId: request.params.categoryId as string, category: { businessId: auth.businessId } }, include: { _count: { select: { products: true } } } });
  if (!subcategory) throw new ApiError(404, "Subcategory not found.", "SUBCATEGORY_NOT_FOUND");
  if (subcategory._count.products) throw new ApiError(409, "Move its products to another subcategory before deleting it.", "SUBCATEGORY_IN_USE");
  await prisma.subcategory.delete({ where: { id: subcategoryId } });
  response.status(204).end();
});

productsRouter.post("/import/csv/parse", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ csv: z.string().min(1).max(1_000_000) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Provide a CSV file as UTF-8 text under 1 MB.", "INVALID_CSV", parsed.error.issues);
  response.json({ data: { rows: parseCsv(parsed.data.csv), next: "POST /api/v1/products/import/validate with these rows, then /import/commit after review." } });
});

productsRouter.post("/import/xlsx/parse", requireRoles(...inventoryRoles), async (request, response) => {
  if (!Buffer.isBuffer(request.body) || request.body.length === 0) throw new ApiError(400, "Upload an XLSX workbook with the supported spreadsheet content type, up to 5 MB.", "INVALID_XLSX");
  response.json({ data: { rows: await parseXlsx(request.body), next: "POST /api/v1/products/import/validate with these rows, then /import/commit after review." } });
});

productsRouter.post("/:productId/image", requireRoles(...inventoryRoles), productImageUpload, async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const productId = request.params.productId as string;
  const file = request.file;
  if (!file) throw new ApiError(400, "Upload one JPEG, PNG, or WebP image using the image field.", "INVALID_PRODUCT_IMAGE");
  const product = await prisma.product.findFirst({ where: { id: productId, businessId: auth.businessId }, select: { id: true, name: true, imagePublicId: true } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const previousAsset = product.imagePublicId ? await prisma.mediaAsset.findFirst({ where: { businessId: auth.businessId, publicId: product.imagePublicId } }) : null;
  const uploaded = await createTrackedMedia({ businessId: auth.businessId, productId: product.id, purpose: "PRODUCT_IMAGE", file });
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.mediaAsset.update({ where: { id: uploaded.asset.id }, data: { secureUrl: uploaded.secureUrl, status: "ACTIVE" } });
      if (previousAsset) {
        const markedOld = await transaction.mediaAsset.updateMany({ where: { id: previousAsset.id, status: "ACTIVE" }, data: { status: "DELETE_PENDING" } });
        if (markedOld.count !== 1) throw new ApiError(409, "The product image changed while you were replacing it. Reload and retry.", "PRODUCT_IMAGE_CONFLICT");
      }
      const changedProduct = await transaction.product.updateMany({ where: { id: product.id, businessId: auth.businessId, imagePublicId: product.imagePublicId }, data: { imageUrl: uploaded.secureUrl, imagePublicId: uploaded.asset.publicId } });
      if (changedProduct.count !== 1) throw new ApiError(409, "The product image changed while you were replacing it. Reload and retry.", "PRODUCT_IMAGE_CONFLICT");
      await transaction.productImage.upsert({
        where: { productId_view_position: { productId: product.id, view: "FRONT", position: 0 } },
        create: { productId: product.id, mediaAssetId: uploaded.asset.id, view: "FRONT", position: 0 },
        update: { mediaAssetId: uploaded.asset.id },
      });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_IMAGE_UPDATED", entityType: "Product", entityId: product.id, after: { imagePublicId: uploaded.asset.publicId, mimeType: uploaded.asset.mimeType, originalFilename: uploaded.asset.originalFilename } });
    });
  } catch (error) {
    await cleanupTrackedMedia({ ...uploaded.asset, resourceType: "image" }, "Could not clean up a Cloudinary image after the product database update failed.");
    throw error;
  }
  if (previousAsset) await cleanupTrackedMedia(previousAsset, "Could not delete replaced product image from Cloudinary.");
  response.json({ data: { id: product.id, imageUrl: uploaded.secureUrl, imagePublicId: uploaded.asset.publicId } });
});

productsRouter.delete("/:productId/image", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const product = await prisma.product.findFirst({ where: { id: request.params.productId as string, businessId: auth.businessId }, select: { id: true, imagePublicId: true, productImages: { where: { isPrimary: true }, include: { mediaAsset: true }, take: 1 } } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  if (!product.imagePublicId) throw new ApiError(404, "This product has no image.", "PRODUCT_IMAGE_NOT_FOUND");
  const primaryImage = product.productImages[0];
  let asset = primaryImage?.mediaAsset ?? await prisma.mediaAsset.findFirst({ where: { businessId: auth.businessId, publicId: product.imagePublicId } });
  if (!asset) asset = await prisma.mediaAsset.create({ data: { businessId: auth.businessId, productId: product.id, purpose: "PRODUCT_IMAGE", resourceType: "image", folder: "legacy/products/images", publicId: product.imagePublicId, status: "DELETE_PENDING" } });
  await prisma.$transaction(async (transaction) => {
    if (primaryImage) {
      await transaction.productImage.delete({ where: { id: primaryImage.id } });
      const fallbackPrimary = await transaction.productImage.findFirst({
        where: { productId: product.id, mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } },
        include: { mediaAsset: { select: { secureUrl: true, publicId: true } } },
        orderBy: [{ view: "asc" }, { position: "asc" }],
      });
      if (fallbackPrimary) await transaction.productImage.update({ where: { id: fallbackPrimary.id }, data: { isPrimary: true } });
      await transaction.product.update({ where: { id: product.id }, data: {
        imageUrl: fallbackPrimary?.mediaAsset.secureUrl ?? null,
        imagePublicId: fallbackPrimary?.mediaAsset.publicId ?? null,
      } });
    } else {
      await transaction.product.update({ where: { id: product.id }, data: { imageUrl: null, imagePublicId: null } });
    }
    await transaction.mediaAsset.update({ where: { id: asset.id }, data: { status: "DELETE_PENDING" } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_IMAGE_REMOVED", entityType: "Product", entityId: product.id, before: { imagePublicId: product.imagePublicId } });
  });
  await cleanupTrackedMedia(asset, "Could not delete removed product image from Cloudinary.");
  response.json({ data: { id: product.id, imageUrl: null } });
});

const productImageViewSchema = z.enum(["FRONT", "BACK", "SIDE", "ADDITIONAL"]);
const productImageInclude = { mediaAsset: { select: { id: true, secureUrl: true, publicId: true, originalFilename: true, mimeType: true, status: true } } } as const;

productsRouter.post("/:productId/images", requireRoles(...inventoryRoles), productImageUpload, async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const parsed = z.object({ view: productImageViewSchema, imageId: z.string().optional(), isPrimary: z.coerce.boolean().optional() }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose Front, Back, Side, or Additional for this image.", "INVALID_PRODUCT_IMAGE_VIEW", parsed.error.issues);
  if (!request.file) throw new ApiError(400, "Upload one JPEG, PNG, or WebP image using the image field.", "INVALID_PRODUCT_IMAGE");
  const product = await prisma.product.findFirst({ where: { id: request.params.productId as string, businessId: auth.businessId }, select: { id: true, imagePublicId: true } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const existing = parsed.data.imageId
    ? await prisma.productImage.findFirst({ where: { id: parsed.data.imageId, productId: product.id }, include: { mediaAsset: true } })
    : parsed.data.view === "ADDITIONAL"
      ? null
      : await prisma.productImage.findFirst({ where: { productId: product.id, view: parsed.data.view }, include: { mediaAsset: true } });
  if (parsed.data.imageId && !existing) throw new ApiError(404, "Product image not found.", "PRODUCT_IMAGE_NOT_FOUND");
  if (existing && existing.view !== parsed.data.view) throw new ApiError(400, "The replacement photo must keep the same view label.", "PRODUCT_IMAGE_VIEW_MISMATCH");
  if (existing && existing.mediaAsset.status !== "ACTIVE") throw new ApiError(409, "This photo is being removed and cannot be replaced.", "PRODUCT_IMAGE_NOT_ACTIVE");
  const lastAdditionalImage = parsed.data.view === "ADDITIONAL"
    ? await prisma.productImage.aggregate({
      where: { productId: product.id, view: "ADDITIONAL" },
      _max: { position: true },
    })
    : null;
  const position = lastAdditionalImage?._max.position ?? -1;
  const uploaded = await createTrackedMedia({ businessId: auth.businessId, productId: product.id, purpose: "PRODUCT_IMAGE", file: request.file });
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.mediaAsset.update({ where: { id: uploaded.asset.id }, data: { secureUrl: uploaded.secureUrl, status: "ACTIVE" } });
      if (existing) {
        const markedOld = await transaction.mediaAsset.updateMany({ where: { id: existing.mediaAssetId, status: "ACTIVE" }, data: { status: "DELETE_PENDING" } });
        if (markedOld.count !== 1) throw new ApiError(409, "This product image changed while it was being replaced. Reload and retry.", "PRODUCT_IMAGE_CONFLICT");
        await transaction.productImage.update({ where: { id: existing.id }, data: { mediaAssetId: uploaded.asset.id } });
      } else {
        await transaction.productImage.create({ data: { productId: product.id, mediaAssetId: uploaded.asset.id, view: parsed.data.view, position: position + 1, isPrimary: parsed.data.isPrimary ?? false } });
      }
      if (parsed.data.isPrimary) {
        await transaction.productImage.updateMany({ where: { productId: product.id, mediaAssetId: { not: uploaded.asset.id } }, data: { isPrimary: false } });
        await transaction.productImage.update({ where: existing ? { id: existing.id } : { mediaAssetId: uploaded.asset.id }, data: { isPrimary: true } });
        await transaction.product.update({ where: { id: product.id }, data: { imageUrl: uploaded.secureUrl, imagePublicId: uploaded.asset.publicId } });
      } else if (existing?.isPrimary || (!existing && parsed.data.view === "FRONT" && !await transaction.productImage.count({ where: { productId: product.id, isPrimary: true } }))) {
        await transaction.productImage.updateMany({ where: { productId: product.id }, data: { isPrimary: false } });
        await transaction.productImage.update({ where: existing ? { id: existing.id } : { mediaAssetId: uploaded.asset.id }, data: { isPrimary: true } });
        await transaction.product.update({ where: { id: product.id }, data: { imageUrl: uploaded.secureUrl, imagePublicId: uploaded.asset.publicId } });
      }
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: existing ? "PRODUCT_IMAGE_REPLACED" : "PRODUCT_IMAGE_ADDED", entityType: "Product", entityId: product.id, after: { view: parsed.data.view, publicId: uploaded.asset.publicId, mimeType: uploaded.asset.mimeType } });
    });
  } catch (error) {
    await cleanupTrackedMedia(uploaded.asset, "Could not clean up a Cloudinary image after the product image update failed.");
    throw error;
  }
  if (existing) await cleanupTrackedMedia(existing.mediaAsset, "Could not delete a replaced product image from Cloudinary.");
  const image = await prisma.productImage.findFirstOrThrow({ where: { productId: product.id, mediaAssetId: uploaded.asset.id }, include: productImageInclude });
  response.status(existing ? 200 : 201).json({ data: image });
});

productsRouter.patch("/:productId/images/:imageId/primary", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const image = await prisma.productImage.findFirst({ where: { id: request.params.imageId as string, productId: request.params.productId as string, product: { businessId: auth.businessId }, mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } }, include: { mediaAsset: true } });
  if (!image) throw new ApiError(404, "Active product photo not found.", "PRODUCT_IMAGE_NOT_FOUND");
  await prisma.$transaction(async (transaction) => {
    await transaction.productImage.updateMany({ where: { productId: image.productId }, data: { isPrimary: false } });
    await transaction.productImage.update({ where: { id: image.id }, data: { isPrimary: true } });
    await transaction.product.update({ where: { id: image.productId }, data: { imageUrl: image.mediaAsset.secureUrl, imagePublicId: image.mediaAsset.publicId } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_MAIN_IMAGE_CHANGED", entityType: "Product", entityId: image.productId, after: { imageId: image.id, publicId: image.mediaAsset.publicId, view: image.view } });
  });
  response.json({ data: { id: image.id, isPrimary: true } });
});

productsRouter.delete("/:productId/images/:imageId", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const image = await prisma.productImage.findFirst({ where: { id: request.params.imageId as string, productId: request.params.productId as string, product: { businessId: auth.businessId } }, include: { mediaAsset: true } });
  if (!image) throw new ApiError(404, "Product image not found.", "PRODUCT_IMAGE_NOT_FOUND");
  await prisma.$transaction(async (transaction) => {
    await transaction.productImage.delete({ where: { id: image.id } });
    const remainingImages = await transaction.productImage.findMany({ where: { productId: image.productId, mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } }, include: { mediaAsset: { select: { secureUrl: true, publicId: true } } }, orderBy: [{ view: "asc" }, { position: "asc" }] });
    const fallbackPrimary = image.isPrimary ? remainingImages[0] : undefined;
    if (fallbackPrimary) await transaction.productImage.update({ where: { id: fallbackPrimary.id }, data: { isPrimary: true } });
    await transaction.product.update({ where: { id: image.productId }, data: {
      ...(image.isPrimary ? { imageUrl: fallbackPrimary?.mediaAsset.secureUrl ?? null, imagePublicId: fallbackPrimary?.mediaAsset.publicId ?? null } : {}),
    } });
    await transaction.mediaAsset.update({ where: { id: image.mediaAssetId }, data: { status: "DELETE_PENDING" } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_IMAGE_REMOVED", entityType: "Product", entityId: image.productId, before: { view: image.view, publicId: image.mediaAsset.publicId } });
  });
  const deleted = await cleanupTrackedMedia(image.mediaAsset, "Could not delete removed product image from Cloudinary.");
  response.json({ data: { id: image.id, view: image.view, deleted, status: deleted ? "DELETED" : "DELETE_PENDING" } });
});

productsRouter.post("/import/validate", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ branchId: z.string().optional(), rows: z.array(z.unknown()).min(1).max(5000) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Upload between 1 and 5,000 product rows.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const branch = parsed.data.branchId ? await prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId } }) : await prisma.branch.findFirst({ where: { businessId: auth.businessId, isDefault: true } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const skuSeen = new Set<string>();
  const barcodeSeen = new Set<string>();
  const results = [];
  for (let index = 0; index < parsed.data.rows.length; index++) {
    const row = importRowSchema.safeParse(parsed.data.rows[index]);
    if (!row.success) { results.push({ row: index + 1, status: "invalid", errors: row.error.issues.map((issue) => issue.message) }); continue; }
    const skuKey = row.data.sku.toLowerCase();
    const barcodeKey = row.data.barcode?.toLowerCase();
    const duplicate = await prisma.product.findFirst({ where: { businessId: auth.businessId, OR: [{ sku: { equals: row.data.sku, mode: "insensitive" as const } }, ...(row.data.barcode ? [{ barcode: { equals: row.data.barcode, mode: "insensitive" as const } }] : [])] }, select: { id: true, name: true, sku: true } });
    const possibleName = await prisma.product.findFirst({ where: { businessId: auth.businessId, normalizedName: normalizeName(row.data.name), state: { not: "ARCHIVED" } }, select: { id: true, name: true, sku: true } });
    const errors = [];
    const category = await prisma.category.findFirst({ where: { businessId: auth.businessId, normalizedName: row.data.category.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ") }, select: { id: true } });
    if (!category) errors.push(`Category "${row.data.category}" does not exist. Create it before importing products.`);
    const subcategory = category && row.data.subcategory
      ? await prisma.subcategory.findFirst({ where: { categoryId: category.id, normalizedName: row.data.subcategory.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ") }, select: { id: true } })
      : null;
    if (category && row.data.subcategory && !subcategory) errors.push(`Subcategory "${row.data.subcategory}" does not exist under ${row.data.category}. Create it before importing products.`);
    if (duplicate) errors.push(`SKU or barcode already belongs to ${duplicate.name} (${duplicate.sku}).`);
    if (row.data.sellingPrice < row.data.costPrice) errors.push("Selling price cannot be below cost price.");
    if (skuSeen.has(skuKey)) errors.push("SKU is repeated in this file.");
    if (barcodeKey && barcodeSeen.has(barcodeKey)) errors.push("Barcode is repeated in this file.");
    if (possibleName && !row.data.duplicateOverrideReason) errors.push(`Possible duplicate: ${possibleName.name} (${possibleName.sku}). Add a duplicate override reason if these are distinct products.`);
    skuSeen.add(skuKey);
    if (barcodeKey) barcodeSeen.add(barcodeKey);
    results.push({ row: index + 1, status: errors.length ? "invalid" : possibleName ? "warning-overridden" : "valid", errors, possibleMatch: possibleName });
  }
  response.json({ data: { branchId: branch.id, total: results.length, valid: results.filter((row) => row.status !== "invalid").length, invalid: results.filter((row) => row.status === "invalid").length, rows: results } });
});

productsRouter.post("/import/commit", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ branchId: z.string().optional(), rows: z.array(importRowSchema).min(1).max(5000) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the import rows and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const branch = parsed.data.branchId ? await prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId } }) : await prisma.branch.findFirst({ where: { businessId: auth.businessId, isDefault: true } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const skuSet = new Set<string>();
  const barcodeSet = new Set<string>();
  const categorySelections: { category: { id: string; name: string }; subcategory: { id: string; name: string } | null }[] = [];
  for (const row of parsed.data.rows) {
    if (row.sellingPrice < row.costPrice) throw new ApiError(400, "An imported product has a selling price below cost price.", "SELLING_PRICE_BELOW_COST", { sku: row.sku });
    if (skuSet.has(row.sku.toLowerCase()) || (row.barcode && barcodeSet.has(row.barcode.toLowerCase()))) throw new ApiError(409, "The import contains repeated SKUs or barcodes.", "DUPLICATE_IMPORT_IDENTIFIER");
    skuSet.add(row.sku.toLowerCase());
    if (row.barcode) barcodeSet.add(row.barcode.toLowerCase());
    const possibleName = await prisma.product.findFirst({ where: { businessId: auth.businessId, OR: [{ sku: { equals: row.sku, mode: "insensitive" as const } }, ...(row.barcode ? [{ barcode: { equals: row.barcode, mode: "insensitive" as const } }] : [])] }, select: { id: true } });
    if (possibleName) throw new ApiError(409, "An import SKU or barcode already exists. Validate and correct the file before committing.", "DUPLICATE_IMPORT_IDENTIFIER", { sku: row.sku });
    const nameMatch = await prisma.product.findFirst({ where: { businessId: auth.businessId, normalizedName: normalizeName(row.name), state: { not: "ARCHIVED" } }, select: { id: true } });
    if (nameMatch && !row.duplicateOverrideReason) throw new ApiError(409, "An import row has a probable name duplicate without an override reason.", "POSSIBLE_DUPLICATE", { sku: row.sku });
    const normalizedCategory = row.category.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
    const category = await prisma.category.findFirst({ where: { businessId: auth.businessId, normalizedName: normalizedCategory }, select: { id: true, name: true } });
    if (!category) throw new ApiError(400, `Create category "${row.category}" before importing products.`, "IMPORT_CATEGORY_REQUIRED", { sku: row.sku });
    const normalizedSubcategory = row.subcategory?.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
    const subcategory = normalizedSubcategory
      ? await prisma.subcategory.findFirst({ where: { categoryId: category.id, normalizedName: normalizedSubcategory }, select: { id: true, name: true } })
      : null;
    if (normalizedSubcategory && !subcategory) throw new ApiError(400, `Create subcategory "${row.subcategory}" under ${category.name} before importing products.`, "IMPORT_SUBCATEGORY_INVALID", { sku: row.sku });
    categorySelections.push({ category, subcategory });
  }
  const result = await prisma.$transaction(async (transaction) => {
    let openingValue = 0;
    const createdProducts = [];
    for (const [index, row] of parsed.data.rows.entries()) {
      const { category, subcategory } = categorySelections[index];
      const product = await transaction.product.create({ data: { businessId: auth.businessId, createdById: auth.userId, sku: row.sku, barcode: row.barcode || null, name: row.name, normalizedName: normalizeName(row.name), description: row.description, category: category.name, categoryId: category.id, subcategory: subcategory?.name ?? null, subcategoryId: subcategory?.id ?? null, unit: row.unit, costPrice: row.costPrice, sellingPrice: row.sellingPrice, reorderLevel: row.reorderLevel, state: "ACTIVE", isPublished: true } });
      await transaction.stockBalance.create({ data: { productId: product.id, branchId: branch.id, onHand: row.openingStock } });
      if (row.openingStock > 0) await transaction.stockLot.create({ data: { productId: product.id, branchId: branch.id, unitCost: row.costPrice, quantity: row.openingStock, origin: "OPENING" } });
      if (row.openingStock > 0) {
        const value = Math.round(row.openingStock * row.costPrice * 100) / 100;
        openingValue += value;
        await transaction.stockMovement.create({ data: { productId: product.id, branchId: branch.id, userId: auth.userId, type: "OPENING_STOCK", quantity: row.openingStock, unitCost: row.costPrice, reference: `IMPORT-${product.id}`, reason: "Opening balance import" } });
      }
      if (row.duplicateOverrideReason) await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_DUPLICATE_OVERRIDE", entityType: "Product", entityId: product.id, after: { normalizedName: product.normalizedName }, reason: row.duplicateOverrideReason });
      createdProducts.push(product);
    }
    if (openingValue > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "OPENING_STOCK_IMPORT", sourceId: `IMPORT-${Date.now()}`, description: "Imported opening stock balances", lines: [{ code: "1200", debit: openingValue }, { code: "3000", credit: openingValue }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_IMPORT_COMMITTED", entityType: "ProductImport", entityId: `IMPORT-${Date.now()}`, after: { productCount: createdProducts.length, openingValue } });
    return { products: createdProducts, openingValue };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: { imported: result.products.length, openingStockValue: result.openingValue } });
});

productsRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const state = typeof request.query.state === "string" && Object.values(ProductState).includes(request.query.state as ProductState) ? request.query.state as ProductState : undefined;
  const products = await prisma.product.findMany({
    where: {
      businessId: auth.businessId,
      ...(state ? { state } : {}),
      ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { sku: { contains: search, mode: "insensitive" } }, { barcode: { contains: search, mode: "insensitive" } }] } : {}),
    },
    include: { balances: { where: { branch: { businessId: auth.businessId } }, select: { branchId: true, onHand: true, reserved: true } }, productImages: { where: { mediaAsset: { status: "ACTIVE" } }, orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }], include: productImageInclude }, specifications: { orderBy: { position: "asc" } } },
    orderBy: { name: "asc" },
    take: 100,
  });
  const canSeeCost = ["OWNER", "STAFF"].includes(auth.role);
  response.json({ data: canSeeCost ? products : products.map(({ costPrice: _costPrice, ...product }) => product), meta: { count: products.length, limit: 100 } });
});

productsRouter.get("/check-duplicates", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const query = z.object({ sku: z.string().trim().min(1).max(80).optional(), barcode: z.string().trim().min(1).max(80).optional(), name: z.string().trim().min(1).max(180).optional(), excludeId: z.string().optional() }).safeParse(request.query);
  if (!query.success || !Object.values(query.data ?? {}).some(Boolean)) throw new ApiError(400, "Provide a product SKU, barcode, or name to check.", "VALIDATION_ERROR", query.success ? undefined : query.error.issues);
  const data = await prisma.product.findMany({ where: { businessId: auth.businessId, state: { not: "ARCHIVED" }, ...(query.data.excludeId ? { id: { not: query.data.excludeId } } : {}), OR: [
    ...(query.data.sku ? [{ sku: { equals: query.data.sku, mode: "insensitive" as const } }] : []),
    ...(query.data.barcode ? [{ barcode: { equals: query.data.barcode, mode: "insensitive" as const } }] : []),
    ...(query.data.name ? [{ normalizedName: normalizeName(query.data.name) }] : []),
  ] }, select: { id: true, sku: true, barcode: true, name: true, category: true, unit: true, state: true }, take: 20 });
  response.json({ data, exactMatches: data.length > 0 });
});

productsRouter.get("/:productId", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const product = await prisma.product.findFirst({ where: { id: request.params.productId as string, businessId: auth.businessId }, include: { balances: { where: { branch: { businessId: auth.businessId } }, include: { branch: { select: { name: true } } } }, productImages: { where: { mediaAsset: { status: "ACTIVE" } }, orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }], include: productImageInclude }, specifications: { orderBy: { position: "asc" } } } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const canSeeCost = ["OWNER", "STAFF"].includes(auth.role);
  const { costPrice, ...safeProduct } = product;
  response.json({ data: canSeeCost ? product : safeProduct });
});

productsRouter.post("/", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = createProductSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the product details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const data = parsed.data;
  if (data.sellingPrice < data.costPrice) throw new ApiError(400, "Selling price cannot be below cost price. Staff can bargain down to the cost price when making a sale.", "SELLING_PRICE_BELOW_COST");
  const category = data.categoryId ? await prisma.category.findFirst({ where: { id: data.categoryId, businessId: auth.businessId }, select: { id: true, name: true } }) : null;
  if (!category) throw new ApiError(400, "Create and choose a category before adding this product.", "PRODUCT_CATEGORY_REQUIRED");
  const subcategory = data.subcategoryId ? await prisma.subcategory.findFirst({ where: { id: data.subcategoryId, categoryId: category.id }, select: { id: true, name: true } }) : null;
  if (data.subcategoryId && !subcategory) throw new ApiError(400, "Choose a subcategory under the selected category.", "INVALID_PRODUCT_SUBCATEGORY");
  const normalizedName = normalizeName(data.name);

  const conflictingCode = await prisma.product.findFirst({
    where: {
      businessId: auth.businessId,
      state: { not: ProductState.ARCHIVED },
      OR: [
        { sku: { equals: data.sku, mode: "insensitive" } },
        ...(data.barcode ? [{ barcode: { equals: data.barcode, mode: "insensitive" as const } }] : []),
      ],
    },
    select: { sku: true, barcode: true, name: true },
  });
  if (conflictingCode) {
    const duplicateField = conflictingCode.sku.toLocaleLowerCase("en-US") === data.sku.toLocaleLowerCase("en-US") ? "SKU" : "barcode";
    throw new ApiError(409, `This ${duplicateField} is already used by ${conflictingCode.name}.`, duplicateField === "SKU" ? "DUPLICATE_PRODUCT_SKU" : "DUPLICATE_PRODUCT_BARCODE", conflictingCode);
  }

  const branchAssignments = auth.role === "STAFF"
    ? auth.branchId ? [{ branchId: auth.branchId, openingStock: data.quantity }] : []
    : (data.branchAssignments ?? []).map((assignment) => ({ ...assignment, openingStock: data.quantity }));
  if (branchAssignments.length === 0) throw new ApiError(400, auth.role === "STAFF" ? "Your account needs a branch assignment before you can create products." : "Choose at least one branch for this product.", auth.role === "STAFF" ? "STAFF_BRANCH_REQUIRED" : "PRODUCT_BRANCH_REQUIRED");
  if (new Set(branchAssignments.map((assignment) => assignment.branchId)).size !== branchAssignments.length) throw new ApiError(400, "Choose each branch only once.", "DUPLICATE_PRODUCT_BRANCH");
  const branches = await prisma.branch.findMany({ where: { businessId: auth.businessId, id: { in: branchAssignments.map((assignment) => assignment.branchId) } }, select: { id: true, name: true } });
  if (branches.length !== branchAssignments.length) throw new ApiError(404, "One or more selected branches could not be found in this business.", "BRANCH_NOT_FOUND");
  const specNames = data.specifications.map((item) => item.name.toLocaleLowerCase("en-NG"));
  if (new Set(specNames).size !== specNames.length) throw new ApiError(400, "Specification names must be unique on this product.", "DUPLICATE_PRODUCT_SPECIFICATION");
  const possibleMatches = await prisma.product.findMany({
    where: { businessId: auth.businessId, state: { not: ProductState.ARCHIVED }, normalizedName },
    select: { id: true, sku: true, name: true },
    take: 5,
  });

  const result = await prisma.$transaction(async (transaction) => {
    const created = await transaction.product.create({
      data: {
        businessId: auth.businessId,
        createdById: auth.userId,
        sku: data.sku,
        barcode: data.barcode || null,
        name: data.name,
        normalizedName,
        description: data.description,
        brand: data.brand || null,
        model: data.model || null,
        category: category.name,
        subcategory: subcategory?.name ?? null,
        categoryId: category.id,
        subcategoryId: subcategory?.id ?? null,
        unit: data.unit,
        costPrice: new Prisma.Decimal(data.costPrice),
        sellingPrice: new Prisma.Decimal(data.sellingPrice),
        reorderLevel: new Prisma.Decimal(data.reorderLevel),
        state: data.publishOnSave ? ProductState.ACTIVE : ProductState.DRAFT,
        isPublished: data.publishOnSave,
      },
    });
    if (data.specifications.length) await transaction.productSpecification.createMany({ data: data.specifications.map((item, position) => ({ productId: created.id, name: item.name, value: item.value, position })) });
    let openingStockValue = 0;
    for (const assignment of branchAssignments) {
      const quantity = new Prisma.Decimal(assignment.openingStock);
      await transaction.stockBalance.create({ data: { productId: created.id, branchId: assignment.branchId, onHand: quantity } });
      if (quantity.gt(0)) {
        const unitCost = new Prisma.Decimal(data.costPrice);
        await transaction.stockLot.create({ data: { productId: created.id, branchId: assignment.branchId, unitCost, quantity, origin: "OPENING" } });
        await transaction.stockMovement.create({ data: { productId: created.id, branchId: assignment.branchId, userId: auth.userId, type: "OPENING_STOCK", quantity, unitCost, reference: `OPENING-${created.id}`, reason: "Opening stock entered during product setup" } });
        openingStockValue += assignment.openingStock * data.costPrice;
      }
    }
    if (openingStockValue > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "PRODUCT_OPENING_STOCK", sourceId: created.id, description: `Opening stock for ${created.name}`, lines: [{ code: "1200", debit: openingStockValue }, { code: "3000", credit: openingStockValue }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_CREATED", entityType: "Product", entityId: created.id, after: { name: created.name, sku: created.sku, category: created.category, brand: created.brand, model: created.model, branchIds: branchAssignments.map((item) => item.branchId), openingStockValue } });
    return { product: created, openingStockValue };
  });
  response.status(201).json({ data: result.product, openingStockValue: result.openingStockValue, possibleMatches });
});

productsRouter.patch("/:productId", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = updateProductSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data ?? {}).length === 0) throw new ApiError(400, "Provide at least one valid product field.", "VALIDATION_ERROR", parsed.success ? undefined : parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const productId = request.params.productId as string;
  const current = await prisma.product.findFirst({ where: { id: productId, businessId: auth.businessId }, select: { id: true, name: true, normalizedName: true, isPublished: true, costPrice: true, sellingPrice: true } });
  if (!current) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const data = parsed.data;
  const nextCostPrice = data.costPrice ?? Number(current.costPrice);
  const nextSellingPrice = data.sellingPrice ?? Number(current.sellingPrice);
  if (nextSellingPrice < nextCostPrice) throw new ApiError(400, "Selling price cannot be below cost price. Staff can bargain down to the cost price when making a sale.", "SELLING_PRICE_BELOW_COST");
  let categoryUpdate: { categoryId?: string | null; category?: string; subcategoryId?: string | null; subcategory?: string | null } = {};
  if (data.categoryId !== undefined || data.subcategoryId !== undefined || data.category !== undefined) {
    const currentProduct = await prisma.product.findUnique({ where: { id: productId }, select: { categoryId: true, subcategoryId: true } });
    const normalizedCategoryName = data.category?.toLocaleLowerCase("en-NG").normalize("NFKC").replace(/\s+/g, " ");
    const categoryByName = normalizedCategoryName ? await prisma.category.findFirst({ where: { businessId: auth.businessId, normalizedName: normalizedCategoryName }, select: { id: true } }) : null;
    const nextCategoryId = data.categoryId === undefined ? (categoryByName?.id ?? currentProduct?.categoryId) : data.categoryId;
    const category = nextCategoryId ? await prisma.category.findFirst({ where: { id: nextCategoryId, businessId: auth.businessId }, select: { id: true, name: true } }) : null;
    if (!category) throw new ApiError(400, "Choose a category for this product.", "PRODUCT_CATEGORY_REQUIRED");
    const categoryChanged = data.categoryId !== undefined && data.categoryId !== currentProduct?.categoryId;
    const nextSubcategoryId = data.subcategoryId === undefined
      ? categoryChanged ? null : currentProduct?.subcategoryId
      : data.subcategoryId;
    if (!nextSubcategoryId) {
      categoryUpdate = { categoryId: category.id, category: category.name, subcategoryId: null, subcategory: null };
    } else {
      const subcategory = await prisma.subcategory.findFirst({ where: { id: nextSubcategoryId, categoryId: category.id }, select: { id: true, name: true } });
      if (!subcategory) throw new ApiError(400, "Choose a subcategory under the selected category.", "INVALID_PRODUCT_SUBCATEGORY");
      categoryUpdate = { categoryId: category.id, category: category.name, subcategoryId: subcategory.id, subcategory: subcategory.name };
    }
  }
  const name = data.name ?? current.name;
  const normalizedName = normalizeName(name);
  const possibleDuplicate = await prisma.product.findFirst({ where: { businessId: auth.businessId, id: { not: productId }, normalizedName, state: { not: ProductState.ARCHIVED } }, select: { id: true, sku: true, name: true } });
  if (possibleDuplicate) throw new ApiError(409, "A product with a matching normalized name already exists.", "POSSIBLE_DUPLICATE", possibleDuplicate);
  const product = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.product.update({ where: { id: productId }, data: {
      ...(data.sku !== undefined ? { sku: data.sku } : {}),
      ...(data.barcode !== undefined ? { barcode: data.barcode || null } : {}),
      ...(data.name !== undefined ? { name, normalizedName } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.brand !== undefined ? { brand: data.brand || null } : {}),
      ...(data.model !== undefined ? { model: data.model || null } : {}),
      ...(data.category !== undefined ? { category: data.category } : {}),
      ...categoryUpdate,
      ...(data.unit !== undefined ? { unit: data.unit } : {}),
      ...(data.costPrice !== undefined ? { costPrice: new Prisma.Decimal(data.costPrice) } : {}),
      ...(data.sellingPrice !== undefined ? { sellingPrice: new Prisma.Decimal(data.sellingPrice) } : {}),
      ...(data.reorderLevel !== undefined ? { reorderLevel: new Prisma.Decimal(data.reorderLevel) } : {}),
      ...(data.state !== undefined ? { state: data.state } : {}),
      ...(data.isPublished !== undefined ? { isPublished: data.isPublished } : {}),
    } });
    if (data.specifications) {
      const names = data.specifications.map((item) => item.name.toLocaleLowerCase("en-NG"));
      if (new Set(names).size !== names.length) throw new ApiError(400, "Specification names must be unique on this product.", "DUPLICATE_PRODUCT_SPECIFICATION");
      await transaction.productSpecification.deleteMany({ where: { productId } });
      if (data.specifications.length) await transaction.productSpecification.createMany({ data: data.specifications.map((item, position) => ({ productId, name: item.name, value: item.value, position })) });
    }
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_UPDATED", entityType: "Product", entityId: productId, before: { name: current.name }, after: { name: updated.name, sku: updated.sku, state: updated.state } });
    return updated;
  });
  response.json({ data: product });
});

productsRouter.post("/:productId/adjustments", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = adjustStockSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a non-zero quantity and a reason for the adjustment.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const productId = request.params.productId as string;
  const { branchId, quantity, reason } = parsed.data;
  if (auth.role === "STAFF" && (!auth.branchId || auth.branchId !== branchId)) throw new ApiError(403, "You can only adjust stock in your assigned branch.", "BRANCH_ACCESS_DENIED");
  const product = await prisma.product.findFirst({ where: { id: productId, businessId: auth.businessId }, select: { id: true, costPrice: true } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const branch = await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");

  try {
    const movement = await prisma.$transaction(async (transaction) => {
      const balance = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId, branchId } } });
      const current = balance?.onHand ?? new Prisma.Decimal(0);
      const next = current.add(new Prisma.Decimal(quantity));
      if (next.lessThan(0)) throw new ApiError(409, "The adjustment would make stock negative.", "INSUFFICIENT_STOCK");
      if (next.lessThan(balance?.reserved ?? 0)) throw new ApiError(409, "Available stock cannot be adjusted below active reservations.", "STOCK_RESERVED");
      await transaction.stockBalance.upsert({
        where: { productId_branchId: { productId, branchId } },
        create: { productId, branchId, onHand: next },
        update: { onHand: next },
      });
      if (quantity > 0) await transaction.stockLot.create({ data: { productId, branchId, unitCost: product.costPrice, quantity, origin: "ADJUSTMENT" } });
      if (quantity < 0) {
        const lots = await transaction.stockLot.findMany({ where: { productId, branchId }, orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }] });
        let remaining = new Prisma.Decimal(Math.abs(quantity));
        for (const lot of lots) {
          if (remaining.isZero()) break;
          const available = lot.quantity.minus(lot.reserved);
          if (available.lessThanOrEqualTo(0)) continue;
          const taken = Prisma.Decimal.min(remaining, available);
          await transaction.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: taken } } });
          remaining = remaining.minus(taken);
        }
        if (remaining.greaterThan(0)) throw new ApiError(409, "Batch quantities do not reconcile with available stock.", "STOCK_LOT_RECONCILIATION");
      }
      const movement = await transaction.stockMovement.create({ data: { productId, branchId, userId: auth.userId, type: "ADJUSTMENT", quantity: new Prisma.Decimal(quantity), reason } });
      const cost = Number((Math.abs(quantity) * Number((await transaction.product.findUniqueOrThrow({ where: { id: productId }, select: { costPrice: true } })).costPrice)).toFixed(2));
      if (cost > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "STOCK_ADJUSTMENT", sourceId: movement.id, description: reason, lines: quantity < 0 ? [{ code: "6000", debit: cost }, { code: "1200", credit: cost }] : [{ code: "1200", debit: cost }, { code: "4900", credit: cost }] });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "STOCK_ADJUSTMENT_POSTED", entityType: "Product", entityId: productId, after: { branchId, quantity }, reason });
      return movement;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(201).json({ data: movement });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") throw new ApiError(409, "Stock changed during this adjustment. Review the latest balance and retry.", "STOCK_CONFLICT");
    throw error;
  }
});

productsRouter.get("/:productId/movements", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const product = await prisma.product.findFirst({ where: { id: request.params.productId as string, businessId: auth.businessId }, select: { id: true } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const requestedBranchId = typeof request.query.branchId === "string" ? request.query.branchId : undefined;
  if (auth.role === "STAFF" && (!auth.branchId || (requestedBranchId && requestedBranchId !== auth.branchId))) throw new ApiError(403, "You can only view stock movements in your assigned branch.", "BRANCH_ACCESS_DENIED");
  const branchId = auth.role === "STAFF" ? auth.branchId : requestedBranchId;
  const movements = await prisma.stockMovement.findMany({ where: { productId: product.id, branch: { businessId: auth.businessId }, ...(branchId ? { branchId } : {}) }, include: { branch: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  response.json({ data: movements });
});

productsRouter.post("/merge", requireRoles("OWNER"), async (request, response) => {
  const parsed = z.object({ sourceProductId: z.string(), targetProductId: z.string(), reason: z.string().trim().min(5).max(500) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose source and target products and record the merge reason.", "VALIDATION_ERROR", parsed.error.issues);
  if (parsed.data.sourceProductId === parsed.data.targetProductId) throw new ApiError(400, "A product cannot be merged into itself.", "INVALID_PRODUCT_MERGE");
  const auth = response.locals.auth as AuthContext;
  const [source, target] = await Promise.all([
    prisma.product.findFirst({ where: { id: parsed.data.sourceProductId, businessId: auth.businessId }, include: { balances: true } }),
    prisma.product.findFirst({ where: { id: parsed.data.targetProductId, businessId: auth.businessId }, include: { balances: true } }),
  ]);
  if (!source || !target) throw new ApiError(404, "Source or target product was not found.", "PRODUCT_NOT_FOUND");
  if (source.state === "ARCHIVED" || source.mergedIntoId || target.state === "ARCHIVED" || target.mergedIntoId) throw new ApiError(409, "Archived or previously merged products cannot be merged again.", "INVALID_PRODUCT_MERGE");
  const activeReservations = await prisma.stockReservation.count({ where: { productId: source.id, status: "ACTIVE" } });
  if (activeReservations) throw new ApiError(409, "Release or fulfill active reservations before merging this product.", "ACTIVE_RESERVATIONS_EXIST");
  const result = await prisma.$transaction(async (transaction) => {
    const currentSource = await transaction.product.findUniqueOrThrow({ where: { id: source.id }, include: { balances: true } });
    const currentTarget = await transaction.product.findUniqueOrThrow({ where: { id: target.id }, include: { balances: true } });
    let sourceValue = 0;
    let targetValue = 0;
    for (const balance of currentSource.balances) {
      if (Number(balance.reserved) > 0) throw new ApiError(409, "Release or fulfill active reservations before merging this product.", "ACTIVE_RESERVATIONS_EXIST");
      const targetBalance = currentTarget.balances.find((item) => item.branchId === balance.branchId);
      sourceValue += Number(balance.onHand) * Number(currentSource.costPrice);
      targetValue += Number(targetBalance?.onHand ?? 0) * Number(currentTarget.costPrice);
      if (Number(balance.onHand) > 0) {
        await transaction.stockBalance.upsert({ where: { productId_branchId: { productId: target.id, branchId: balance.branchId } }, create: { productId: target.id, branchId: balance.branchId, onHand: balance.onHand }, update: { onHand: { increment: balance.onHand } } });
        await transaction.stockMovement.createMany({ data: [
          { productId: source.id, branchId: balance.branchId, userId: auth.userId, type: "ADJUSTMENT", quantity: balance.onHand.negated(), reason: `Merged into ${target.sku}: ${parsed.data.reason}` },
          { productId: target.id, branchId: balance.branchId, userId: auth.userId, type: "ADJUSTMENT", quantity: balance.onHand, reason: `Merged from ${source.sku}: ${parsed.data.reason}` },
        ] });
        const sourceLots = await transaction.stockLot.findMany({ where: { productId: source.id, branchId: balance.branchId, quantity: { gt: 0 } } });
        const lotsTotal = sourceLots.reduce((sum, lot) => sum.add(lot.quantity), new Prisma.Decimal(0));
        if (!lotsTotal.equals(balance.onHand)) throw new ApiError(409, "Source product batch quantities do not reconcile with on-hand stock.", "STOCK_LOT_RECONCILIATION");
        for (const lot of sourceLots) {
          await transaction.stockLot.update({ where: { id: lot.id }, data: { quantity: 0 } });
          await transaction.stockLot.create({ data: { productId: target.id, branchId: balance.branchId, batchNumber: lot.batchNumber, expiresAt: lot.expiresAt, unitCost: lot.unitCost, quantity: lot.quantity, origin: "MERGE" } });
        }
      }
      await transaction.stockBalance.update({ where: { productId_branchId: { productId: source.id, branchId: balance.branchId } }, data: { onHand: 0, reserved: 0 } });
    }
    const totalQuantity = [...currentSource.balances, ...currentTarget.balances].reduce((sum, balance) => sum + Number(balance.onHand), 0);
    const mergedCost = totalQuantity > 0 ? Math.round(((sourceValue + targetValue) / totalQuantity) * 100) / 100 : Number(currentTarget.costPrice);
    await transaction.product.update({ where: { id: target.id }, data: { costPrice: mergedCost } });
    const record = await transaction.productMerge.create({ data: { businessId: auth.businessId, sourceProductId: source.id, targetProductId: target.id, userId: auth.userId, reason: parsed.data.reason } });
    await transaction.product.update({ where: { id: source.id }, data: { state: "ARCHIVED", mergedIntoId: target.id } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PRODUCT_MERGED", entityType: "ProductMerge", entityId: record.id, before: { sourceSku: source.sku, sourceName: source.name }, after: { targetSku: target.sku, targetName: target.name }, reason: parsed.data.reason });
    return record;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: { merge: result, sourceId: source.id, targetId: target.id } });
});
