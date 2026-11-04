import { Router } from "express";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry, type LedgerLine } from "../lib/accounting.js";
import { takeFefoLots } from "../lib/stock-lots.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const suppliersRouter = Router();
export const purchasesRouter = Router();
const supplierSchema = z.object({ name: z.string().trim().min(1).max(180), phone: z.string().trim().max(40).optional(), email: z.email().optional(), address: z.string().trim().max(1000).optional(), paymentTermsDays: z.coerce.number().int().min(0).max(365).default(0) });
const purchaseSchema = z.object({ branchId: z.string(), supplierId: z.string(), expectedAt: z.coerce.date().optional(), notes: z.string().max(2000).optional(), lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive(), unitCost: z.coerce.number().min(0) })).min(1).max(500) });
const receiveSchema = z.object({ notes: z.string().max(2000).optional(), invoice: z.object({ invoiceNumber: z.string().trim().min(1).max(80), totalAmount: z.coerce.number().positive(), dueAt: z.coerce.date().optional() }).optional(), lines: z.array(z.object({ purchaseOrderLineId: z.string(), acceptedQuantity: z.coerce.number().min(0), rejectedQuantity: z.coerce.number().min(0).default(0), unitCost: z.coerce.number().min(0), batchNumber: z.string().max(100).optional(), expiresAt: z.coerce.date().optional() })).min(1).max(500) });
const makeReference = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;

suppliersRouter.use(requireAuth);
purchasesRouter.use(requireAuth);

suppliersRouter.get("/", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const suppliers = await prisma.supplier.findMany({ where: { businessId: auth.businessId }, include: { invoices: { include: { allocations: { include: { payment: { select: { status: true } } } }, returns: { select: { creditAmount: true } } } }, _count: { select: { purchaseOrders: true } } }, orderBy: { name: "asc" }, take: 200 });
  response.json({ data: suppliers.map(({ invoices, ...supplier }) => {
    const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.totalAmount), 0);
    const totalPaid = invoices.reduce((sum, invoice) => sum + invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((paid, allocation) => paid + Number(allocation.amount), 0), 0);
    const credits = invoices.reduce((sum, invoice) => sum + invoice.returns.reduce((credit, entry) => credit + Number(entry.creditAmount), 0), 0);
    const overdue = invoices.filter((invoice) => invoice.dueAt && invoice.dueAt < new Date()).reduce((sum, invoice) => sum + Number(invoice.totalAmount) - invoice.returns.reduce((credit, entry) => credit + Number(entry.creditAmount), 0) - invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((paid, allocation) => paid + Number(allocation.amount), 0), 0);
    return { ...supplier, totalInvoiced, totalPaid, credits, outstanding: totalInvoiced - totalPaid - credits, overdue };
  }) });
});

suppliersRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = supplierSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the supplier details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const supplier = await prisma.$transaction(async (transaction) => {
    const created = await transaction.supplier.create({ data: { ...parsed.data, businessId: auth.businessId } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "SUPPLIER_CREATED", entityType: "Supplier", entityId: created.id, after: { name: created.name } });
    return created;
  });
  response.status(201).json({ data: supplier });
});

purchasesRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const branchId = typeof request.query.branchId === "string" ? request.query.branchId : undefined;
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const data = await prisma.purchaseOrder.findMany({ where: { businessId: auth.businessId, ...(branchId ? { branchId } : {}), ...(status ? { status: status as never } : {}) }, include: { supplier: { select: { id: true, name: true } }, branch: { select: { id: true, name: true } }, lines: { include: { product: { select: { id: true, name: true, sku: true } }, receiptLines: { select: { acceptedQuantity: true, rejectedQuantity: true } } } }, receipts: { select: { id: true, reference: true, receivedAt: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data });
});

purchasesRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = purchaseSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the purchase order details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const input = parsed.data;
  const [supplier, branch, products] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: input.supplierId, businessId: auth.businessId } }),
    prisma.branch.findFirst({ where: { id: input.branchId, businessId: auth.businessId } }),
    prisma.product.findMany({ where: { id: { in: [...new Set(input.lines.map((line) => line.productId))] }, businessId: auth.businessId }, select: { id: true } }),
  ]);
  if (!supplier || !branch) throw new ApiError(404, "Supplier or branch not found in this business.", "PURCHASE_REFERENCE_NOT_FOUND");
  if (products.length !== new Set(input.lines.map((line) => line.productId)).size) throw new ApiError(404, "One or more products were not found in this business.", "PRODUCT_NOT_FOUND");
  const order = await prisma.$transaction(async (transaction) => {
    const created = await transaction.purchaseOrder.create({ data: { businessId: auth.businessId, branchId: branch.id, supplierId: supplier.id, createdById: auth.userId, number: makeReference("PO"), expectedAt: input.expectedAt, notes: input.notes, lines: { create: input.lines.map((line) => ({ productId: line.productId, orderedQuantity: line.quantity, unitCost: line.unitCost })) } }, include: { lines: true, supplier: { select: { name: true } } } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PURCHASE_ORDER_CREATED", entityType: "PurchaseOrder", entityId: created.id, after: { number: created.number, lineCount: created.lines.length } });
    return created;
  });
  response.status(201).json({ data: order });
});

purchasesRouter.post("/:purchaseOrderId/submit", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const order = await prisma.purchaseOrder.findFirst({ where: { id: request.params.purchaseOrderId as string, businessId: auth.businessId }, select: { id: true, status: true } });
  if (!order) throw new ApiError(404, "Purchase order not found.", "PURCHASE_NOT_FOUND");
  if (order.status !== "DRAFT") throw new ApiError(409, "Only draft purchase orders can be submitted.", "INVALID_PURCHASE_TRANSITION");
  await prisma.purchaseOrder.update({ where: { id: order.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
  response.json({ data: { id: order.id, status: "SUBMITTED" } });
});

purchasesRouter.post("/:purchaseOrderId/approve", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const order = await prisma.purchaseOrder.findFirst({ where: { id: request.params.purchaseOrderId as string, businessId: auth.businessId }, select: { id: true, status: true } });
  if (!order) throw new ApiError(404, "Purchase order not found.", "PURCHASE_NOT_FOUND");
  if (order.status !== "SUBMITTED") throw new ApiError(409, "Only submitted purchase orders can be approved.", "INVALID_PURCHASE_TRANSITION");
  const updated = await prisma.$transaction(async (transaction) => {
    const approved = await transaction.purchaseOrder.update({ where: { id: order.id }, data: { status: "APPROVED", approvedById: auth.userId, approvedAt: new Date() } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PURCHASE_ORDER_APPROVED", entityType: "PurchaseOrder", entityId: order.id, before: { status: "SUBMITTED" }, after: { status: "APPROVED" } });
    return approved;
  });
  response.json({ data: updated });
});

purchasesRouter.post("/:purchaseOrderId/receive", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = receiveSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the received quantities and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const input = parsed.data;
  const po = await prisma.purchaseOrder.findFirst({
    where: { id: request.params.purchaseOrderId as string, businessId: auth.businessId },
    include: { lines: { include: { receiptLines: { select: { acceptedQuantity: true, rejectedQuantity: true } } } } },
  });
  if (!po) throw new ApiError(404, "Purchase order not found.", "PURCHASE_NOT_FOUND");
  if (!["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status)) throw new ApiError(409, "Only approved purchase orders can receive stock.", "INVALID_PURCHASE_TRANSITION");
  const lines = new Map(po.lines.map((line) => [line.id, line]));
  for (const line of input.lines) {
    const poLine = lines.get(line.purchaseOrderLineId);
    if (!poLine) throw new ApiError(400, "A received line does not belong to this purchase order.", "INVALID_PURCHASE_LINE");
    const alreadyReceived = poLine.receiptLines.reduce((sum, receipt) => sum + Number(receipt.acceptedQuantity) + Number(receipt.rejectedQuantity), 0);
    if (alreadyReceived + line.acceptedQuantity + line.rejectedQuantity > Number(poLine.orderedQuantity)) throw new ApiError(409, `Received quantity exceeds the ordered amount for ${poLine.id}.`, "RECEIPT_QUANTITY_EXCEEDED");
    if (line.acceptedQuantity + line.rejectedQuantity <= 0) throw new ApiError(400, "Each receipt line must include accepted or rejected quantity.", "INVALID_RECEIPT_QUANTITY");
  }
  if (new Set(input.lines.map((line) => line.purchaseOrderLineId)).size !== input.lines.length) throw new ApiError(400, "Each purchase order line can appear only once per receipt.", "DUPLICATE_RECEIPT_LINE");

  try {
    const receipt = await prisma.$transaction(async (transaction) => {
      const created = await transaction.goodsReceipt.create({ data: { purchaseOrderId: po.id, branchId: po.branchId, receivedById: auth.userId, reference: makeReference("GRN"), notes: input.notes } });
      for (const line of input.lines) {
        const poLine = lines.get(line.purchaseOrderLineId)!;
        const existingBalance = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: poLine.productId, branchId: po.branchId } } });
        const oldQuantity = existingBalance?.onHand ?? 0;
        const receiptLine = await transaction.goodsReceiptLine.create({ data: { goodsReceiptId: created.id, purchaseOrderLineId: poLine.id, productId: poLine.productId, acceptedQuantity: line.acceptedQuantity, rejectedQuantity: line.rejectedQuantity, unitCost: line.unitCost, batchNumber: line.batchNumber, expiresAt: line.expiresAt } });
        if (line.acceptedQuantity > 0) await transaction.stockLot.create({ data: { productId: poLine.productId, branchId: po.branchId, sourceReceiptLineId: receiptLine.id, batchNumber: line.batchNumber, expiresAt: line.expiresAt, unitCost: line.unitCost, quantity: line.acceptedQuantity, origin: "PURCHASE" } });
        await transaction.stockBalance.upsert({ where: { productId_branchId: { productId: poLine.productId, branchId: po.branchId } }, create: { productId: poLine.productId, branchId: po.branchId, onHand: line.acceptedQuantity }, update: { onHand: { increment: line.acceptedQuantity } } });
        if (line.acceptedQuantity > 0) await transaction.stockMovement.create({ data: { productId: poLine.productId, branchId: po.branchId, userId: auth.userId, type: "PURCHASE_RECEIPT", quantity: line.acceptedQuantity, unitCost: line.unitCost, reference: created.reference } });
        if (line.acceptedQuantity > 0) {
          const priorValue = Number(oldQuantity) * Number((await transaction.product.findUniqueOrThrow({ where: { id: poLine.productId }, select: { costPrice: true } })).costPrice);
          const nextCost = (priorValue + line.acceptedQuantity * line.unitCost) / (Number(oldQuantity) + line.acceptedQuantity);
          await transaction.product.update({ where: { id: poLine.productId }, data: { costPrice: nextCost } });
        }
      }
      if (input.invoice) await transaction.supplierInvoice.create({ data: { businessId: auth.businessId, supplierId: po.supplierId, purchaseOrderId: po.id, goodsReceiptId: created.id, invoiceNumber: input.invoice.invoiceNumber, totalAmount: input.invoice.totalAmount, dueAt: input.invoice.dueAt } });
      const receivedValue = Number(input.lines.reduce((sum, line) => sum + line.acceptedQuantity * line.unitCost, 0).toFixed(2));
      if (receivedValue > 0) {
        const ledgerLines: LedgerLine[] = [{ code: "1200", debit: receivedValue, description: "Accepted goods received" }];
        if (input.invoice) {
          const invoiceValue = input.invoice.totalAmount;
          ledgerLines.push({ code: "2000", credit: invoiceValue, description: "Supplier invoice payable" });
          if (invoiceValue > receivedValue) ledgerLines.push({ code: "5100", debit: invoiceValue - receivedValue, description: "Invoice cost above received inventory value" });
          if (receivedValue > invoiceValue) ledgerLines.push({ code: "5100", credit: receivedValue - invoiceValue, description: "Invoice cost below received inventory value" });
        } else {
          ledgerLines.push({ code: "2050", credit: receivedValue, description: "Received goods awaiting supplier invoice" });
        }
        await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "GOODS_RECEIPT", sourceId: created.id, description: `Goods receipt ${created.reference}`, lines: ledgerLines });
      }
      const updatedLines = await transaction.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id }, include: { receiptLines: { select: { acceptedQuantity: true, rejectedQuantity: true } } } });
      const fullyReceived = updatedLines.every((line) => line.receiptLines.reduce((sum, item) => sum + Number(item.acceptedQuantity) + Number(item.rejectedQuantity), 0) >= Number(line.orderedQuantity));
      const updated = await transaction.purchaseOrder.update({ where: { id: po.id }, data: { status: fullyReceived ? "RECEIVED" : "PARTIALLY_RECEIVED" } });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "GOODS_RECEIVED", entityType: "GoodsReceipt", entityId: created.id, after: { reference: created.reference, lineCount: input.lines.length } });
      return { ...created, purchaseOrderStatus: updated.status };
    }, { isolationLevel: "Serializable" });
    response.status(201).json({ data: receipt });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "P2034") throw new ApiError(409, "This purchase order changed while receiving stock. Reload and retry.", "PURCHASE_CONFLICT");
    throw error;
  }
});

suppliersRouter.get("/:supplierId/returns", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const supplier = await prisma.supplier.findFirst({ where: { id: request.params.supplierId as string, businessId: auth.businessId }, select: { id: true } });
  if (!supplier) throw new ApiError(404, "Supplier not found.", "SUPPLIER_NOT_FOUND");
  const data = await prisma.supplierReturn.findMany({ where: { supplierId: supplier.id, businessId: auth.businessId }, include: { invoice: { select: { invoiceNumber: true } }, lines: { include: { product: { select: { name: true, sku: true } } } } }, orderBy: { createdAt: "desc" } });
  response.json({ data });
});

suppliersRouter.post("/:supplierId/returns", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ branchId: z.string(), supplierInvoiceId: z.string(), reason: z.string().trim().min(3).max(500), lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive() })).min(1).max(100) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the returned products, invoice, and reason.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const [supplier, branch, invoice, products] = await Promise.all([
    prisma.supplier.findFirst({ where: { id: request.params.supplierId as string, businessId: auth.businessId } }),
    prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId } }),
    prisma.supplierInvoice.findFirst({ where: { id: parsed.data.supplierInvoiceId, businessId: auth.businessId, supplierId: request.params.supplierId as string } }),
    prisma.product.findMany({ where: { id: { in: parsed.data.lines.map((line) => line.productId) }, businessId: auth.businessId }, include: { balances: { where: { branchId: parsed.data.branchId } } } }),
  ]);
  if (!supplier || !branch || !invoice) throw new ApiError(404, "Supplier, branch, or invoice was not found.", "SUPPLIER_RETURN_REFERENCE_NOT_FOUND");
  if (products.length !== new Set(parsed.data.lines.map((line) => line.productId)).size) throw new ApiError(404, "One or more products were not found.", "PRODUCT_NOT_FOUND");
  const productMap = new Map(products.map((product) => [product.id, product]));
  let total = 0;
  const lines = parsed.data.lines.map((line) => {
    const product = productMap.get(line.productId)!;
    const balance = product.balances[0];
    if (line.quantity > Number(balance?.onHand ?? 0) - Number(balance?.reserved ?? 0)) throw new ApiError(409, `${product.name} does not have enough available stock to return.`, "INSUFFICIENT_STOCK");
    total += line.quantity * Number(product.costPrice);
    return { product, quantity: line.quantity, unitCost: Number(product.costPrice) };
  });
  total = Math.round(total * 100) / 100;
  const paid = await prisma.supplierPaymentAllocation.aggregate({ where: { supplierInvoiceId: invoice.id, payment: { status: "SUCCEEDED" } }, _sum: { amount: true } });
  const credits = await prisma.supplierReturn.aggregate({ where: { supplierInvoiceId: invoice.id }, _sum: { creditAmount: true } });
  if (Number(paid._sum.amount ?? 0) + Number(credits._sum.creditAmount ?? 0) + total > Number(invoice.totalAmount) + 0.001) throw new ApiError(409, "Supplier credit note would exceed the invoice balance.", "OVER_CREDIT_NOTE");
  const result = await prisma.$transaction(async (transaction) => {
    const returned = await transaction.supplierReturn.create({
      data: {
        businessId: auth.businessId, branchId: branch.id, supplierId: supplier.id, supplierInvoiceId: invoice.id,
        userId: auth.userId, reference: `SR-${randomUUID().slice(0, 10).toUpperCase()}`,
        creditAmount: total, reason: parsed.data.reason,
        lines: { create: lines.map((line) => ({ productId: line.product.id, quantity: line.quantity, unitCost: line.unitCost })) },
      },
    });
    for (const line of lines) {
      const balance = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: line.product.id, branchId: branch.id } } });
      if (!balance || Number(balance.onHand) - Number(balance.reserved) < line.quantity) throw new ApiError(409, "Stock changed while returning goods.", "STOCK_CONFLICT");
      const changed = await transaction.stockBalance.updateMany({ where: { productId: line.product.id, branchId: branch.id, onHand: balance.onHand, reserved: balance.reserved }, data: { onHand: { decrement: line.quantity } } });
      if (!changed.count) throw new ApiError(409, "Stock changed while returning goods.", "STOCK_CONFLICT");
      await takeFefoLots(transaction, { productId: line.product.id, branchId: branch.id, quantity: line.quantity, includeExpired: true });
      await transaction.stockMovement.create({ data: { productId: line.product.id, branchId: branch.id, userId: auth.userId, type: "SUPPLIER_RETURN", quantity: new Prisma.Decimal(line.quantity).negated(), unitCost: line.unitCost, reference: returned.reference, reason: parsed.data.reason } });
    }
    if (total > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "SUPPLIER_RETURN", sourceId: returned.id, description: `Supplier credit note ${returned.reference}`, lines: [{ code: "2000", debit: total, description: "Reduce accounts payable" }, { code: "1200", credit: total, description: "Inventory returned to supplier" }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "SUPPLIER_RETURN_POSTED", entityType: "SupplierReturn", entityId: returned.id, after: { reference: returned.reference, creditAmount: total }, reason: parsed.data.reason });
    return returned;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ data: result });
});
