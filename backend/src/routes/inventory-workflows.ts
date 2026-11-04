import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry } from "../lib/accounting.js";
import { takeFefoLots } from "../lib/stock-lots.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const inventoryWorkflowRouter = Router();
const inventoryRoles = ["OWNER", "STAFF"] as const;
const ref = (prefix: string) => `${prefix}-${randomUUID().slice(0, 10).toUpperCase()}`;
inventoryWorkflowRouter.use(requireAuth);

inventoryWorkflowRouter.get("/summary", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const branchId = typeof request.query.branchId === "string" ? request.query.branchId : undefined;
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const [balances, expiringWithin30Days] = await Promise.all([
    prisma.stockBalance.findMany({ where: { branch: { businessId: auth.businessId, ...(branchId ? { id: branchId } : {}) } }, include: { product: { select: { id: true, name: true, sku: true, category: true, unit: true, imageUrl: true, reorderLevel: true, costPrice: true } }, branch: { select: { name: true } } } }),
    prisma.stockLot.count({ where: { branch: { businessId: auth.businessId, ...(branchId ? { id: branchId } : {}) }, quantity: { gt: 0 }, expiresAt: { gte: new Date(), lte: new Date(Date.now() + 30 * 86_400_000) } } }),
  ]);
  const canSeeCost = ["OWNER", "STAFF"].includes(auth.role);
  const rows = balances.map(({ product, branch, onHand, reserved }) => ({ productId: product.id, name: product.name, sku: product.sku, category: product.category, unit: product.unit, imageUrl: product.imageUrl, branch: branch.name, onHand: Number(onHand), reserved: Number(reserved), available: Number(onHand) - Number(reserved), reorderLevel: Number(product.reorderLevel), unitCost: Number(product.costPrice), inventoryValue: Number(onHand) * Number(product.costPrice) }));
  const data = rows.map(({ unitCost, inventoryValue, ...row }) => ({ ...row, ...(canSeeCost ? { unitCost, inventoryValue } : {}) }));
  const summary = {
    balanceCount: rows.length,
    productCount: new Set(rows.map((row) => row.productId)).size,
    onHandUnits: rows.reduce((sum, row) => sum + row.onHand, 0),
    reservedUnits: rows.reduce((sum, row) => sum + row.reserved, 0),
    availableUnits: rows.reduce((sum, row) => sum + row.available, 0),
    lowStockCount: rows.filter((row) => row.available > 0 && row.available <= row.reorderLevel).length,
    outOfStockCount: rows.filter((row) => row.available <= 0).length,
    expiringWithin30Days,
    ...(canSeeCost ? { inventoryValue: rows.reduce((sum, row) => sum + row.inventoryValue, 0) } : {}),
  };
  response.json({ data, summary });
});

inventoryWorkflowRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const pagination = z.object({ branchId: z.string().optional(), search: z.string().trim().max(180).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query);
  if (!pagination.success) throw new ApiError(400, "Check the inventory filters and pagination.", "VALIDATION_ERROR", pagination.error.issues);
  const { branchId, search, page, limit } = pagination.data;
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const where = { branch: { businessId: auth.businessId, ...(branchId ? { id: branchId } : {}) }, ...(search ? { product: { OR: [{ name: { contains: search, mode: "insensitive" as const } }, { sku: { contains: search, mode: "insensitive" as const } }, { barcode: { contains: search, mode: "insensitive" as const } }] } } : {}) };
  const [total, data] = await Promise.all([
    prisma.stockBalance.count({ where }),
    prisma.stockBalance.findMany({ where, include: { product: { select: { id: true, sku: true, name: true, category: true, costPrice: true, reorderLevel: true } }, branch: { select: { id: true, name: true } } }, orderBy: [{ product: { name: "asc" } }, { branch: { name: "asc" } }], skip: (page - 1) * limit, take: limit }),
  ]);
  const canSeeCost = ["OWNER", "STAFF"].includes(auth.role);
  response.json({ data: data.map(({ onHand, reserved, product, branch }) => ({ product: canSeeCost ? product : (({ costPrice: _cost, ...safe }) => safe)(product), branch, onHand, reserved, available: onHand.sub(reserved) })), meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

inventoryWorkflowRouter.get("/movements", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const pagination = z.object({ branchId: z.string().optional(), productId: z.string().optional(), type: z.enum(["OPENING_STOCK", "PURCHASE_RECEIPT", "SALE", "CUSTOMER_RETURN", "SUPPLIER_RETURN", "TRANSFER_IN", "TRANSFER_OUT", "DAMAGE", "EXPIRY", "THEFT", "ADJUSTMENT"]).optional(), page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(200).default(50) }).safeParse(request.query);
  if (!pagination.success) throw new ApiError(400, "Check the stock movement filters and pagination.", "VALIDATION_ERROR", pagination.error.issues);
  const { branchId, productId, type, page, limit } = pagination.data;
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  if (productId && !await prisma.product.findFirst({ where: { id: productId, businessId: auth.businessId } })) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const where = { product: { businessId: auth.businessId }, ...(branchId ? { branchId } : {}), ...(productId ? { productId } : {}), ...(type ? { type } : {}) };
  const [total, data] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({ where, include: { product: { select: { id: true, sku: true, name: true } }, branch: { select: { id: true, name: true } }, user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
  ]);
  response.json({ data, meta: { page, limit, total, pages: Math.ceil(total / limit) } });
});

inventoryWorkflowRouter.get("/lots", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const filter = z.object({ branchId: z.string(), productId: z.string().optional(), includeDepleted: z.enum(["true", "false"]).transform((value) => value === "true").optional().default(false) }).safeParse(request.query);
  if (!filter.success) throw new ApiError(400, "Check the batch filters.", "VALIDATION_ERROR", filter.error.issues);
  const branch = await prisma.branch.findFirst({ where: { id: filter.data.branchId, businessId: auth.businessId }, select: { id: true } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  if (filter.data.productId && !await prisma.product.findFirst({ where: { id: filter.data.productId, businessId: auth.businessId } })) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const lots = await prisma.stockLot.findMany({ where: { branchId: branch.id, ...(filter.data.productId ? { productId: filter.data.productId } : {}), ...(filter.data.includeDepleted ? {} : { quantity: { gt: 0 } }) }, include: { product: { select: { id: true, sku: true, name: true } } }, orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }], take: 1000 });
  const canSeeCost = ["OWNER", "STAFF"].includes(auth.role);
  response.json({ data: lots.map((lot) => ({ id: lot.id, product: lot.product, branchId: lot.branchId, batchNumber: lot.batchNumber, expiresAt: lot.expiresAt, quantity: lot.quantity, reserved: lot.reserved, available: lot.quantity.sub(lot.reserved), origin: lot.origin, ...(canSeeCost ? { unitCost: lot.unitCost } : {}) })) });
});

inventoryWorkflowRouter.get("/transfers", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const data = await prisma.stockTransfer.findMany({ where: { businessId: auth.businessId }, include: { sourceBranch: { select: { name: true } }, destinationBranch: { select: { name: true } }, lines: { include: { product: { select: { name: true, sku: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data });
});

inventoryWorkflowRouter.post("/transfers", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ sourceBranchId: z.string(), destinationBranchId: z.string(), lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive() })).min(1).max(200) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the transfer branches and quantities.", "VALIDATION_ERROR", parsed.error.issues);
  if (parsed.data.sourceBranchId === parsed.data.destinationBranchId) throw new ApiError(400, "Source and destination branches must be different.", "INVALID_TRANSFER");
  if (new Set(parsed.data.lines.map((line) => line.productId)).size !== parsed.data.lines.length) throw new ApiError(400, "Each product can appear only once in a transfer.", "DUPLICATE_TRANSFER_LINE");
  const auth = response.locals.auth as AuthContext;
  const [source, destination, productCount] = await Promise.all([
    prisma.branch.findFirst({ where: { id: parsed.data.sourceBranchId, businessId: auth.businessId } }),
    prisma.branch.findFirst({ where: { id: parsed.data.destinationBranchId, businessId: auth.businessId } }),
    prisma.product.count({ where: { businessId: auth.businessId, id: { in: parsed.data.lines.map((line) => line.productId) } } }),
  ]);
  if (!source || !destination || productCount !== parsed.data.lines.length) throw new ApiError(404, "A branch or product was not found in this business.", "TRANSFER_REFERENCE_NOT_FOUND");
  const transfer = await prisma.$transaction(async (transaction) => {
    const created = await transaction.stockTransfer.create({ data: { businessId: auth.businessId, sourceBranchId: source.id, destinationBranchId: destination.id, createdById: auth.userId, reference: ref("TRF"), lines: { create: parsed.data.lines } }, include: { lines: true } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "STOCK_TRANSFER_CREATED", entityType: "StockTransfer", entityId: created.id, after: { reference: created.reference, lineCount: created.lines.length } });
    return created;
  });
  response.status(201).json({ data: transfer });
});

inventoryWorkflowRouter.post("/transfers/:transferId/dispatch", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const transfer = await prisma.stockTransfer.findFirst({ where: { id: request.params.transferId as string, businessId: auth.businessId }, include: { lines: true } });
  if (!transfer) throw new ApiError(404, "Transfer not found.", "TRANSFER_NOT_FOUND");
  if (transfer.status !== "DRAFT") throw new ApiError(409, "Only draft transfers can be dispatched.", "INVALID_TRANSFER_TRANSITION");
  const result = await prisma.$transaction(async (transaction) => {
    for (const line of transfer.lines) {
      const balance = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: line.productId, branchId: transfer.sourceBranchId } } });
      if (!balance || new Prisma.Decimal(line.quantity).greaterThan(balance.onHand.minus(balance.reserved))) throw new ApiError(409, "Insufficient available stock to dispatch this transfer.", "INSUFFICIENT_STOCK");
      const changed = await transaction.stockBalance.updateMany({ where: { productId: line.productId, branchId: transfer.sourceBranchId, onHand: balance.onHand, reserved: balance.reserved }, data: { onHand: { decrement: line.quantity } } });
      if (!changed.count) throw new ApiError(409, "Stock changed during dispatch. Reload and retry.", "STOCK_CONFLICT");
      const lots = await takeFefoLots(transaction, { productId: line.productId, branchId: transfer.sourceBranchId, quantity: line.quantity, includeExpired: true });
      for (const lot of lots) {
        const batch = await transaction.stockLot.findUniqueOrThrow({ where: { id: lot.stockLotId }, select: { batchNumber: true, expiresAt: true } });
        await transaction.stockTransferLot.create({ data: { transferLineId: line.id, batchNumber: batch.batchNumber, expiresAt: batch.expiresAt, unitCost: lot.unitCost, quantity: lot.quantity } });
      }
      await transaction.stockMovement.create({ data: { productId: line.productId, branchId: transfer.sourceBranchId, userId: auth.userId, type: "TRANSFER_OUT", quantity: new Prisma.Decimal(line.quantity).negated(), reference: transfer.reference } });
    }
    const updated = await transaction.stockTransfer.update({ where: { id: transfer.id }, data: { status: "IN_TRANSIT", approvedById: auth.userId, dispatchedAt: new Date() } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "STOCK_TRANSFER_DISPATCHED", entityType: "StockTransfer", entityId: transfer.id, before: { status: "DRAFT" }, after: { status: "IN_TRANSIT" } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: result });
});

inventoryWorkflowRouter.post("/transfers/:transferId/receive", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const transfer = await prisma.stockTransfer.findFirst({ where: { id: request.params.transferId as string, businessId: auth.businessId }, include: { lines: true } });
  if (!transfer) throw new ApiError(404, "Transfer not found.", "TRANSFER_NOT_FOUND");
  if (transfer.status !== "IN_TRANSIT") throw new ApiError(409, "Only in-transit transfers can be received.", "INVALID_TRANSFER_TRANSITION");
  const result = await prisma.$transaction(async (transaction) => {
    for (const line of transfer.lines) {
      await transaction.stockBalance.upsert({ where: { productId_branchId: { productId: line.productId, branchId: transfer.destinationBranchId } }, create: { productId: line.productId, branchId: transfer.destinationBranchId, onHand: line.quantity }, update: { onHand: { increment: line.quantity } } });
      const transferLots = await transaction.stockTransferLot.findMany({ where: { transferLineId: line.id } });
      const transferred = transferLots.reduce((sum, lot) => sum.add(lot.quantity), new Prisma.Decimal(0));
      if (!transferred.equals(line.quantity)) throw new ApiError(409, "In-transit batch quantities do not match the transfer quantity.", "TRANSFER_LOT_MISMATCH");
      for (const lot of transferLots) await transaction.stockLot.create({ data: { productId: line.productId, branchId: transfer.destinationBranchId, batchNumber: lot.batchNumber, expiresAt: lot.expiresAt, unitCost: lot.unitCost, quantity: lot.quantity, origin: "TRANSFER" } });
      await transaction.stockMovement.create({ data: { productId: line.productId, branchId: transfer.destinationBranchId, userId: auth.userId, type: "TRANSFER_IN", quantity: line.quantity, reference: transfer.reference } });
    }
    const updated = await transaction.stockTransfer.update({ where: { id: transfer.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "STOCK_TRANSFER_RECEIVED", entityType: "StockTransfer", entityId: transfer.id, before: { status: "IN_TRANSIT" }, after: { status: "RECEIVED" } });
    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: result });
});

inventoryWorkflowRouter.get("/counts", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({ data: await prisma.stockCount.findMany({ where: { businessId: auth.businessId }, include: { branch: { select: { name: true } }, lines: { include: { product: { select: { name: true, sku: true, costPrice: true } } } } }, orderBy: { createdAt: "desc" }, take: 100 }) });
});

inventoryWorkflowRouter.post("/counts", requireRoles(...inventoryRoles), async (request, response) => {
  const parsed = z.object({ branchId: z.string(), reason: z.string().trim().max(500).optional(), lines: z.array(z.object({ productId: z.string(), countedQuantity: z.coerce.number().min(0) })).min(1).max(2000) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the branch and counted quantities.", "VALIDATION_ERROR", parsed.error.issues);
  if (new Set(parsed.data.lines.map((line) => line.productId)).size !== parsed.data.lines.length) throw new ApiError(400, "Each product can appear only once in a stock count.", "DUPLICATE_COUNT_LINE");
  const auth = response.locals.auth as AuthContext;
  const branch = await prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const products = await prisma.product.findMany({ where: { businessId: auth.businessId, id: { in: parsed.data.lines.map((line) => line.productId) } }, include: { balances: { where: { branchId: branch.id } } } });
  if (products.length !== parsed.data.lines.length) throw new ApiError(404, "One or more products were not found.", "PRODUCT_NOT_FOUND");
  const productMap = new Map(products.map((product) => [product.id, product]));
  const lines = parsed.data.lines.map((line) => {
    const product = productMap.get(line.productId)!;
    const systemQuantity = Number(product.balances[0]?.onHand ?? 0);
    return { productId: line.productId, systemQuantity, countedQuantity: line.countedQuantity, variance: line.countedQuantity - systemQuantity };
  });
  const count = await prisma.stockCount.create({ data: { businessId: auth.businessId, branchId: branch.id, createdById: auth.userId, reference: ref("CNT"), reason: parsed.data.reason, lines: { create: lines } }, include: { lines: true } });
  response.status(201).json({ data: count });
});

inventoryWorkflowRouter.post("/counts/:countId/submit", requireRoles(...inventoryRoles), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const count = await prisma.stockCount.findFirst({ where: { id: request.params.countId as string, businessId: auth.businessId } });
  if (!count) throw new ApiError(404, "Stock count not found.", "STOCK_COUNT_NOT_FOUND");
  if (count.status !== "DRAFT") throw new ApiError(409, "Only draft stock counts can be submitted.", "INVALID_COUNT_TRANSITION");
  const updated = await prisma.stockCount.update({ where: { id: count.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  response.json({ data: updated });
});

inventoryWorkflowRouter.post("/counts/:countId/approve", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const count = await prisma.stockCount.findFirst({ where: { id: request.params.countId as string, businessId: auth.businessId } });
  if (!count || count.status !== "SUBMITTED") throw new ApiError(409, "A submitted stock count was not found.", "INVALID_COUNT_TRANSITION");
  const updated = await prisma.stockCount.update({ where: { id: count.id }, data: { status: "APPROVED", approvedById: auth.userId, approvedAt: new Date() } });
  response.json({ data: updated });
});

inventoryWorkflowRouter.post("/counts/:countId/post", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const count = await prisma.stockCount.findFirst({ where: { id: request.params.countId as string, businessId: auth.businessId, status: "APPROVED" }, include: { lines: { include: { product: { select: { costPrice: true } } } } } });
  if (!count) throw new ApiError(404, "Approved stock count not found.", "APPROVED_COUNT_NOT_FOUND");
  const posted = await prisma.$transaction(async (transaction) => {
    let losses = 0;
    let gains = 0;
    for (const line of count.lines) {
      const balance = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: line.productId, branchId: count.branchId } } });
      const current = balance?.onHand ?? new Prisma.Decimal(0);
      if (!current.equals(line.systemQuantity)) throw new ApiError(409, "Stock changed after counting began. Recount affected items before posting.", "COUNT_STALE", { productId: line.productId });
      if (line.variance.isZero()) continue;
      if (line.countedQuantity.lessThan(balance?.reserved ?? 0)) throw new ApiError(409, "Counted on-hand stock cannot be below active reservations.", "COUNT_BELOW_RESERVED", { productId: line.productId });
      await transaction.stockBalance.upsert({ where: { productId_branchId: { productId: line.productId, branchId: count.branchId } }, create: { productId: line.productId, branchId: count.branchId, onHand: line.countedQuantity }, update: { onHand: line.countedQuantity } });
      if (line.variance.greaterThan(0)) await transaction.stockLot.create({ data: { productId: line.productId, branchId: count.branchId, unitCost: line.product.costPrice, quantity: line.variance, origin: "ADJUSTMENT" } });
      else {
        const lots = await transaction.stockLot.findMany({ where: { productId: line.productId, branchId: count.branchId }, orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }] });
        let remaining = line.variance.abs();
        for (const lot of lots) {
          if (remaining.isZero()) break;
          const available = lot.quantity.minus(lot.reserved);
          if (available.lessThanOrEqualTo(0)) continue;
          const taken = Prisma.Decimal.min(remaining, available);
          await transaction.stockLot.update({ where: { id: lot.id }, data: { quantity: { decrement: taken } } });
          remaining = remaining.minus(taken);
        }
        if (remaining.greaterThan(0)) throw new ApiError(409, "Batch quantities do not reconcile with the counted stock.", "STOCK_LOT_RECONCILIATION");
      }
      await transaction.stockMovement.create({ data: { productId: line.productId, branchId: count.branchId, userId: auth.userId, type: "ADJUSTMENT", quantity: line.variance, reason: count.reason || `Stock count ${count.reference}`, reference: count.reference } });
      const value = Math.abs(Number(line.variance) * Number(line.product.costPrice));
      if (line.variance.lessThan(0)) losses += value; else gains += value;
    }
    if (losses > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "STOCK_COUNT", sourceId: count.id, description: `Stock count ${count.reference} shrinkage`, lines: [{ code: "6000", debit: losses }, { code: "1200", credit: losses }] });
    if (gains > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "STOCK_COUNT", sourceId: `${count.id}:gain`, description: `Stock count ${count.reference} gain`, lines: [{ code: "1200", debit: gains }, { code: "4900", credit: gains }] });
    const result = await transaction.stockCount.update({ where: { id: count.id }, data: { status: "POSTED", postedAt: new Date() } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "STOCK_COUNT_POSTED", entityType: "StockCount", entityId: count.id, after: { reference: count.reference, lossValue: losses, gainValue: gains } });
    return result;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: posted });
});
