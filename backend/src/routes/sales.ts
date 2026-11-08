import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry, type LedgerLine } from "../lib/accounting.js";
import { takeFefoLots } from "../lib/stock-lots.js";
import { requireAuth, requireRoles, requireStaffAccess, type AuthContext } from "../middleware/auth.js";

export const salesRouter = Router();
const saleSchema = z.object({ branchId: z.string(), customerId: z.string().optional(), creditReference: z.string().trim().max(100).optional(), dueAt: z.coerce.date().optional(), cashShiftId: z.string().optional(), tax: z.coerce.number().min(0).default(0), channel: z.enum(["POS", "MANUAL"]).default("POS"), lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().positive().optional() })).min(1).max(100), payments: z.array(z.object({ method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), amount: z.coerce.number().positive() })).default([]) });
const reference = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
const moneyRound = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
const formatMoney = (amount: number) => `₦${new Intl.NumberFormat("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`;
const formatDateTime = (value: Date | string) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

salesRouter.use(requireAuth);

salesRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const channel = typeof request.query.channel === "string" ? request.query.channel : undefined;
  const branchId = typeof request.query.branchId === "string" ? request.query.branchId : undefined;
  if (auth.role === "STAFF" && (!auth.branchId || (branchId && branchId !== auth.branchId))) throw new ApiError(403, "You can only view sales for your assigned branch.", "BRANCH_ACCESS_DENIED");
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const scopedBranchId = auth.role === "STAFF" ? auth.branchId : branchId;
  const data = await prisma.sale.findMany({ where: { businessId: auth.businessId, ...(scopedBranchId ? { branchId: scopedBranchId } : {}), ...(channel ? { channel: channel as never } : {}) }, include: { customer: { select: { id: true, name: true, phone: true } }, user: { select: { id: true, name: true } }, lines: true, payments: { include: { payment: { select: { id: true, method: true, status: true, amount: true, paidAt: true } } } }, returns: { select: { total: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data: auth.staffAccessRole === "CASHIER" ? data.map(({ lines, returns: _returns, ...sale }) => ({ ...sale, lines: lines.map(({ unitCost: _unitCost, ...line }) => line) })) : data });
});

salesRouter.get("/lookup", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const parsed = z.object({ reference: z.string().trim().min(1).max(100) }).safeParse(request.query);
  if (!parsed.success) throw new ApiError(400, "Enter a sale or receipt reference.", "VALIDATION_ERROR", parsed.error.issues);
  const referenceValue = parsed.data.reference;
  const sale = await prisma.sale.findFirst({
    where: {
      businessId: auth.businessId,
      OR: [{ id: referenceValue }, { number: { equals: referenceValue, mode: "insensitive" } }],
      ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}),
    },
    include: {
      branch: { select: { name: true } },
      user: { select: { id: true, name: true, email: true } },
      customer: { select: { id: true, name: true, phone: true } },
      lines: { include: { returns: { select: { quantity: true } } } },
      payments: { include: { payment: { select: { method: true, status: true, amount: true } } } },
    },
  });
  if (!sale || sale.status === "CANCELLED") throw new ApiError(404, "No completed sale was found for that reference.", "SALE_NOT_FOUND");
  if (auth.staffAccessRole === "CASHIER") {
    const { lines, ...safeSale } = sale;
    return response.json({ data: { ...safeSale, lines: lines.map(({ unitCost: _unitCost, ...line }) => line) } });
  }
  response.json({ data: sale });
});

salesRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = saleSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the sale and payment details.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const keyHeader = request.get("Idempotency-Key");
  const idempotencyKey = keyHeader?.trim() || undefined;
  if (idempotencyKey && (idempotencyKey.length > 100 || idempotencyKey.length < 8)) throw new ApiError(400, "Idempotency-Key must be between 8 and 100 characters.", "INVALID_IDEMPOTENCY_KEY");
  if (idempotencyKey) {
    const prior = await prisma.sale.findUnique({ where: { businessId_idempotencyKey: { businessId: auth.businessId, idempotencyKey } } });
    if (prior) return response.status(200).json({ data: prior, replayed: true });
  }
  const input = parsed.data;
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new ApiError(400, "Each product can appear only once in the cart.", "DUPLICATE_SALE_LINE");
  const products = await prisma.product.findMany({
    where: { id: { in: [...new Set(input.lines.map((line) => line.productId))] }, businessId: auth.businessId, state: "ACTIVE" },
    include: { balances: { where: { branch: { businessId: auth.businessId } } } },
  });
  if (products.length !== new Set(input.lines.map((line) => line.productId)).size) throw new ApiError(409, "One or more products are unavailable for sale.", "PRODUCT_UNAVAILABLE");
  const branch = await prisma.branch.findFirst({ where: { id: input.branchId, businessId: auth.businessId }, select: { id: true } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  if (auth.role === "STAFF" && (!auth.branchId || auth.branchId !== branch.id)) throw new ApiError(403, "You can only record sales for your assigned branch.", "BRANCH_ACCESS_DENIED");
  const customer = input.customerId ? await prisma.customer.findFirst({ where: { id: input.customerId, businessId: auth.businessId } }) : null;
  if (input.customerId && !customer) throw new ApiError(404, "Customer not found.", "CUSTOMER_NOT_FOUND");
  const shift = input.cashShiftId ? await prisma.cashShift.findFirst({ where: { id: input.cashShiftId, branchId: branch.id, userId: auth.userId, closedAt: null } }) : null;
  if (input.cashShiftId && !shift) throw new ApiError(409, "Cashier shift is not open for this user and branch.", "SHIFT_NOT_OPEN");

  const productMap = new Map(products.map((product) => [product.id, product]));
  const lines = input.lines.map((line) => {
    const product = productMap.get(line.productId)!;
    const balance = product.balances.find((entry) => entry.branchId === branch.id);
    const onHand = Number(balance?.onHand ?? 0);
    const reserved = Number(balance?.reserved ?? 0);
    if (line.quantity > onHand - reserved) throw new ApiError(409, `${product.name} no longer has enough available stock.`, "INSUFFICIENT_STOCK", { productId: product.id, available: onHand - reserved });
    const unitPrice = line.unitPrice ?? Number(product.sellingPrice);
    const unitCost = Number(product.costPrice);
    if (unitPrice < unitCost) throw new ApiError(409, `${product.name} cannot be sold below its cost price of ${unitCost.toFixed(2)}.`, "BELOW_COST_PRICE", { productId: product.id, minimumPrice: unitCost });
    return { product, quantity: line.quantity, unitPrice, unitCost, lineTotal: moneyRound(unitPrice * line.quantity) };
  });
  const subtotal = moneyRound(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  if (input.tax > subtotal) throw new ApiError(400, "Tax cannot exceed the sale subtotal.", "INVALID_SALE_TOTAL");
  const total = moneyRound(subtotal + input.tax);
  const paid = moneyRound(input.payments.reduce((sum, payment) => sum + payment.amount, 0));
  if (auth.role === "STAFF" && auth.staffAccessRole === "CASHIER" && total > paid) throw new ApiError(403, "Cashiers can only complete fully paid sales.", "FORBIDDEN");
  if (paid > total) throw new ApiError(400, "Payment amount cannot exceed the amount due.", "OVERPAYMENT_NOT_SUPPORTED");
  if (input.dueAt && input.dueAt.getTime() < Date.now() && paid < total) throw new ApiError(400, "The payment deadline cannot be in the past.", "INVALID_CREDIT_DUE_DATE");
  if (paid < total && !customer) throw new ApiError(400, "Select a customer to record a credit balance.", "CUSTOMER_REQUIRED_FOR_CREDIT");
  if (input.payments.some((payment) => payment.method === "CASH") && !shift) throw new ApiError(409, "Open a cashier shift before recording cash payment.", "SHIFT_REQUIRED");

  try {
    const sale = await prisma.$transaction(async (transaction) => {
      if (paid < total && customer) {
        const existingSales = await transaction.sale.findMany({ where: { businessId: auth.businessId, customerId: customer.id, status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } } } });
        const currentReceivable = moneyRound(existingSales.reduce((sum, existingSale) => {
          const collected = existingSale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((paidSum, entry) => paidSum + Number(entry.amount), 0);
          const credited = existingSale.returns.reduce((returnSum, entry) => returnSum + Number(entry.total), 0);
          return sum + Math.max(0, Number(existingSale.total) - collected - credited);
        }, 0));
        const remainingCredit = Math.max(0, Number(customer.creditLimit ?? 0) - currentReceivable);
        if (remainingCredit < total - paid) throw new ApiError(409, "Customer credit limit does not cover this balance.", "CREDIT_LIMIT_EXCEEDED", { remainingCredit });
      }
      let saleCost = 0;
      for (const line of lines) {
        const currentBalance = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: line.product.id, branchId: branch.id } } });
        const currentOnHand = currentBalance?.onHand ?? new Prisma.Decimal(0);
        const currentReserved = currentBalance?.reserved ?? new Prisma.Decimal(0);
        if (new Prisma.Decimal(line.quantity).greaterThan(currentOnHand.minus(currentReserved))) throw new ApiError(409, `${line.product.name} no longer has enough available stock.`, "INSUFFICIENT_STOCK");
        const updated = await transaction.stockBalance.updateMany({ where: { productId: line.product.id, branchId: branch.id, onHand: currentOnHand, reserved: currentReserved }, data: { onHand: { decrement: line.quantity } } });
        if (updated.count !== 1) throw new ApiError(409, `${line.product.name} stock changed before checkout completed.`, "STOCK_CONFLICT");
        const allocations = await takeFefoLots(transaction, { productId: line.product.id, branchId: branch.id, quantity: line.quantity });
        saleCost += allocations.reduce((sum, allocation) => sum + Number(allocation.unitCost) * Number(allocation.quantity), 0);
        (line as typeof line & { lotAllocations: typeof allocations }).lotAllocations = allocations;
      }
      const created = await transaction.sale.create({ data: { businessId: auth.businessId, branchId: branch.id, userId: auth.userId, customerId: customer?.id, number: reference("SALE"), channel: input.channel, subtotal, discount: 0, tax: input.tax, total, dueAt: total > paid && customer ? input.dueAt ?? new Date(Date.now() + customer.creditDays * 24 * 60 * 60 * 1000) : null, creditReference: input.creditReference, idempotencyKey, cashShiftId: shift?.id, lines: { create: lines.map((line) => ({ productId: line.product.id, productName: line.product.name, sku: line.product.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) }, }, include: { lines: true } });
      for (const line of lines) {
        const saleLine = created.lines.find((createdLine) => createdLine.productId === line.product.id)!;
        const allocations = (line as typeof line & { lotAllocations: { stockLotId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal }[] }).lotAllocations;
        const weightedCost = allocations.reduce((sum, allocation) => sum + Number(allocation.unitCost) * Number(allocation.quantity), 0) / line.quantity;
        await transaction.saleLine.update({ where: { id: saleLine.id }, data: { unitCost: weightedCost } });
        await transaction.saleLotAllocation.createMany({ data: allocations.map((allocation) => ({ saleLineId: saleLine.id, stockLotId: allocation.stockLotId, quantity: allocation.quantity, unitCost: allocation.unitCost })) });
      }
      for (const line of lines) {
        await transaction.stockMovement.create({ data: { productId: line.product.id, branchId: branch.id, userId: auth.userId, type: "SALE", quantity: new Prisma.Decimal(line.quantity).negated(), unitCost: line.unitCost, reference: created.number } });
      }
      for (const tender of input.payments) {
        const payment = await transaction.payment.create({ data: { businessId: auth.businessId, method: tender.method, status: "SUCCEEDED", amount: tender.amount, reference: reference("PAY"), paidAt: new Date(), saleAllocations: { create: { saleId: created.id, amount: tender.amount } } } });
        await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "PAYMENT_RECORDED", entityType: "Payment", entityId: payment.id, after: { saleId: created.id, amount: tender.amount, method: tender.method } });
      }
      saleCost = moneyRound(saleCost);
      const ledgerLines: LedgerLine[] = input.payments.map((tender) => ({ code: tender.method === "CASH" ? "1000" : "1010", debit: tender.amount, description: `${tender.method} sale payment` }));
      if (total - paid > 0) ledgerLines.push({ code: "1100", debit: total - paid, description: "Customer receivable" });
      ledgerLines.push({ code: "4000", credit: subtotal, description: "Gross sales revenue" });
      if (input.tax > 0) ledgerLines.push({ code: "2100", credit: input.tax, description: "Sales tax payable" });
      if (saleCost > 0) ledgerLines.push({ code: "5000", debit: saleCost, description: "Cost of goods sold" }, { code: "1200", credit: saleCost, description: "Inventory relieved" });
      if (total > 0 || saleCost > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "SALE", sourceId: created.id, description: `Sale ${created.number}`, lines: ledgerLines });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "SALE_POSTED", entityType: "Sale", entityId: created.id, after: { number: created.number, total, lineCount: lines.length, paid } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(201).json({ data: sale });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) {
      if (idempotencyKey) {
        const prior = await prisma.sale.findUnique({ where: { businessId_idempotencyKey: { businessId: auth.businessId, idempotencyKey } } });
        if (prior) return response.status(200).json({ data: prior, replayed: true });
      }
      throw new ApiError(409, "Sale identifiers or stock changed during checkout. Reload the cart and retry.", "SALE_CONFLICT");
    }
    throw error;
  }
});

const returnSchema = z.object({ reason: z.string().trim().min(3).max(500), method: z.enum(["CASH", "BANK_TRANSFER", "OTHER"]).default("OTHER"), lines: z.array(z.object({ saleLineId: z.string(), quantity: z.coerce.number().positive(), restock: z.boolean().default(true) })).min(1) });
salesRouter.post("/:saleId/returns", requireStaffAccess("SENIOR_STAFF"), async (request, response) => {
  const parsed = returnSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the returned items and reason.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const sale = await prisma.sale.findFirst({ where: { id: request.params.saleId as string, businessId: auth.businessId, status: { not: "CANCELLED" } }, include: { lines: { include: { lotAllocations: true, returns: { include: { lotAllocations: true } } } }, payments: { include: { payment: true } }, returns: true, refunds: true } });
  if (!sale) throw new ApiError(404, "Sale not found.", "SALE_NOT_FOUND");
  if (auth.role === "STAFF" && (!auth.branchId || sale.branchId !== auth.branchId)) throw new ApiError(403, "You can only process returns for your assigned branch.", "BRANCH_ACCESS_DENIED");
  const byLine = new Map(sale.lines.map((line) => [line.id, line]));
  if (new Set(parsed.data.lines.map((line) => line.saleLineId)).size !== parsed.data.lines.length) throw new ApiError(400, "Each sale line can appear only once per return.", "DUPLICATE_RETURN_LINE");
  let returnedValue = 0;
  for (const item of parsed.data.lines) {
    const line = byLine.get(item.saleLineId);
    if (!line) throw new ApiError(400, "A returned item does not belong to this sale.", "INVALID_RETURN_LINE");
    const returnedQuantity = line.returns.reduce((sum, entry) => sum + Number(entry.quantity), 0);
    if (returnedQuantity + item.quantity > Number(line.quantity)) throw new ApiError(409, "Returned quantity exceeds the quantity sold.", "RETURN_QUANTITY_EXCEEDED");
    returnedValue += Number(line.lineTotal) * item.quantity / Number(line.quantity);
  }
  const proportionalNet = sale.subtotal.isZero() ? 0 : moneyRound(returnedValue * Number(sale.total) / Number(sale.subtotal));
  const originalPaid = sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const alreadyRefunded = sale.refunds.filter((entry) => entry.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const refundAmount = Math.min(proportionalNet, Math.max(0, originalPaid - alreadyRefunded));
  const referenceValue = `RET-${randomUUID().slice(0, 8).toUpperCase()}`;
  const result = await prisma.$transaction(async (transaction) => {
    const returned = await transaction.saleReturn.create({ data: { saleId: sale.id, userId: auth.userId, reference: referenceValue, reason: parsed.data.reason, total: proportionalNet, lines: { create: parsed.data.lines.map((item) => ({ saleLineId: item.saleLineId, productId: byLine.get(item.saleLineId)!.productId, quantity: item.quantity, refundAmount: Number(byLine.get(item.saleLineId)!.lineTotal) * item.quantity / Number(byLine.get(item.saleLineId)!.quantity), restock: item.restock })) }, }, include: { lines: true } });
    for (const item of parsed.data.lines) {
      const saleLine = byLine.get(item.saleLineId)!;
      if (item.restock) {
        await transaction.stockBalance.upsert({ where: { productId_branchId: { productId: saleLine.productId, branchId: sale.branchId } }, create: { productId: saleLine.productId, branchId: sale.branchId, onHand: item.quantity }, update: { onHand: { increment: item.quantity } } });
        await transaction.stockMovement.create({ data: { productId: saleLine.productId, branchId: sale.branchId, userId: auth.userId, type: "CUSTOMER_RETURN", quantity: item.quantity, unitCost: saleLine.unitCost, reference: returned.reference } });
      }
      const returnLine = returned.lines.find((line) => line.saleLineId === item.saleLineId)!;
      let remaining = new Prisma.Decimal(item.quantity);
      for (const original of saleLine.lotAllocations) {
        if (remaining.isZero()) break;
        const previouslyReturned = saleLine.returns.flatMap((entry) => entry.lotAllocations).filter((allocation) => allocation.stockLotId === original.stockLotId).reduce((sum, allocation) => sum.add(allocation.quantity), new Prisma.Decimal(0));
        const availableToReturn = original.quantity.minus(previouslyReturned);
        if (availableToReturn.lessThanOrEqualTo(0)) continue;
        const quantity = Prisma.Decimal.min(remaining, availableToReturn);
        if (item.restock) await transaction.stockLot.update({ where: { id: original.stockLotId }, data: { quantity: { increment: quantity } } });
        await transaction.returnLotAllocation.create({ data: { saleReturnLineId: returnLine.id, stockLotId: original.stockLotId, quantity, unitCost: original.unitCost } });
        remaining = remaining.minus(quantity);
      }
      if (remaining.greaterThan(0) && item.restock) {
        const fallbackLot = await transaction.stockLot.create({ data: { productId: saleLine.productId, branchId: sale.branchId, unitCost: saleLine.unitCost, quantity: remaining, origin: "RETURN" } });
        await transaction.returnLotAllocation.create({ data: { saleReturnLineId: returnLine.id, stockLotId: fallbackLot.id, quantity: remaining, unitCost: saleLine.unitCost } });
      }
    }
    let refund = null;
    if (refundAmount > 0) refund = await transaction.refund.create({ data: { saleId: sale.id, saleReturnId: returned.id, userId: auth.userId, reference: `RF-${randomUUID().slice(0, 10).toUpperCase()}`, amount: refundAmount, method: parsed.data.method, reason: parsed.data.reason, status: "SUCCEEDED" } });
    const returnCost = moneyRound(parsed.data.lines.filter((item) => item.restock).reduce((sum, item) => sum + Number(byLine.get(item.saleLineId)!.unitCost) * item.quantity, 0));
    const returnRevenue = Number(sale.total) > 0 ? proportionalNet * (Number(sale.subtotal) - Number(sale.discount)) / Number(sale.total) : proportionalNet;
    const returnTax = proportionalNet - returnRevenue;
    const returnJournal: LedgerLine[] = [{ code: "4100", debit: returnRevenue, description: "Customer return credit" }];
    if (returnTax > 0) returnJournal.push({ code: "2100", debit: returnTax, description: "Reverse tax payable on returned goods" });
    if (refundAmount > 0) returnJournal.push({ code: parsed.data.method === "CASH" ? "1000" : "1010", credit: refundAmount, description: `${parsed.data.method} refund issued to customer` });
    if (proportionalNet > refundAmount) returnJournal.push({ code: "1100", credit: proportionalNet - refundAmount, description: "Customer receivable credit" });
    if (returnCost > 0) returnJournal.push({ code: "1200", debit: returnCost, description: "Restocked returned goods" }, { code: "5000", credit: returnCost, description: "Reverse cost of goods sold" });
    if (proportionalNet > 0 || returnCost > 0) await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "SALE_RETURN", sourceId: returned.id, description: `Return ${returned.reference}`, lines: returnJournal });
    const refreshedLines = await transaction.saleLine.findMany({ where: { saleId: sale.id }, include: { returns: { select: { quantity: true } } } });
    const fullyReturned = refreshedLines.every((line) => line.returns.reduce((sum, item) => sum + Number(item.quantity), 0) >= Number(line.quantity));
    await transaction.sale.update({ where: { id: sale.id }, data: { status: fullyReturned ? "RETURNED" : "PARTIALLY_RETURNED" } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "SALE_RETURN_POSTED", entityType: "SaleReturn", entityId: returned.id, after: { reference: returned.reference, creditAmount: proportionalNet, refundAmount, refundStatus: refund ? "SUCCEEDED" : null, refundedBy: auth.userId } });
    return { return: returned, refund };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: result });
});

salesRouter.post("/returns/:returnId/approve-refund", requireStaffAccess("SENIOR_STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const refund = await prisma.refund.findFirst({ where: { saleReturnId: request.params.returnId as string, sale: { businessId: auth.businessId } } });
  if (!refund) throw new ApiError(404, "Refund request not found.", "REFUND_NOT_FOUND");
  if (refund.status !== "PENDING") throw new ApiError(409, "Only pending refund requests can be approved.", "INVALID_REFUND_TRANSITION");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.refund.update({ where: { id: refund.id }, data: { status: "SUCCEEDED" } });
    const cashCode = refund.method === "CASH" ? "1000" : "1010";
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "REFUND", sourceId: refund.id, description: `Refund ${refund.reference}`, lines: [{ code: "2200", debit: refund.amount, description: "Clear approved refund payable" }, { code: cashCode, credit: refund.amount, description: "Refund paid to customer" }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "REFUND_APPROVED", entityType: "Refund", entityId: refund.id, before: { status: "PENDING" }, after: { status: "SUCCEEDED", amount: refund.amount.toString() }, reason: refund.reason });
    return result;
  });
  response.json({ data: updated });
});

const shiftSchema = z.object({ branchId: z.string(), openingCash: z.coerce.number().min(0) });
salesRouter.post("/shifts/open", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = shiftSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter the branch and opening cash amount.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const branch = await prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  if (auth.role === "STAFF" && (!auth.branchId || auth.branchId !== branch.id)) throw new ApiError(403, "You can only clock in at your assigned branch.", "BRANCH_ACCESS_DENIED");
  const openKey = `${branch.id}:${auth.userId}`;
  try {
    const shift = await prisma.$transaction(async (transaction) => {
      const created = await transaction.cashShift.create({ data: { businessId: auth.businessId, branchId: branch.id, userId: auth.userId, openingCash: parsed.data.openingCash, openKey } });
      const owners = await transaction.user.findMany({ where: { businessId: auth.businessId, role: "OWNER", isActive: true }, select: { id: true } });
      if (owners.length) await transaction.notification.createMany({ data: owners.map((owner) => ({ businessId: auth.businessId, userId: owner.id, type: "CASH_SHIFT", severity: "INFO", title: "Staff clocked in", message: `${auth.name} clocked in at ${branch.name} on ${formatDateTime(created.openedAt)}.`, entityType: "CashShift", entityId: created.id, dedupeKey: `SHIFT-OPENED:${created.id}:${owner.id}` })) });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CASH_SHIFT_OPENED", entityType: "CashShift", entityId: created.id, after: { branchId: branch.id, openedAt: created.openedAt, openingCash: created.openingCash.toString() } });
      return created;
    });
    response.status(201).json({ data: shift });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "Close the current shift before opening another.", "SHIFT_ALREADY_OPEN");
    throw error;
  }
});

salesRouter.get("/shifts/current", requireRoles("OWNER", "STAFF"), async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const data = await prisma.cashShift.findFirst({ where: { businessId: auth.businessId, userId: auth.userId, closedAt: null }, include: { sales: { include: { payments: { include: { payment: true } }, refunds: true } }, movements: true } });
  response.json({ data });
});

salesRouter.post("/shifts/:shiftId/movements", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ type: z.enum(["PAID_IN", "PAID_OUT"]), amount: z.coerce.number().positive(), reason: z.string().trim().min(3).max(300), accountId: z.string() }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Provide the cash movement type, amount, reason, and counterpart account.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const shift = await prisma.cashShift.findFirst({ where: { id: request.params.shiftId as string, businessId: auth.businessId, userId: auth.userId, closedAt: null } });
  if (!shift) throw new ApiError(404, "Open cashier shift not found.", "SHIFT_NOT_FOUND");
  const account = await prisma.account.findFirst({ where: { id: parsed.data.accountId, businessId: auth.businessId, isActive: true } });
  if (!account || account.code === "1000") throw new ApiError(400, "Choose an active counterpart account other than cash on hand.", "INVALID_COUNTERPART_ACCOUNT");
  const movement = await prisma.$transaction(async (transaction) => {
    const created = await transaction.cashMovement.create({ data: { cashShiftId: shift.id, type: parsed.data.type, amount: parsed.data.amount, reason: parsed.data.reason } });
    const cashDirection = parsed.data.type === "PAID_IN"
      ? [{ code: "1000", debit: parsed.data.amount }, { code: account.code, credit: parsed.data.amount }]
      : [{ code: account.code, debit: parsed.data.amount }, { code: "1000", credit: parsed.data.amount }];
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "CASH_SHIFT_MOVEMENT", sourceId: created.id, description: parsed.data.reason, lines: cashDirection });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CASH_SHIFT_MOVEMENT_RECORDED", entityType: "CashMovement", entityId: created.id, after: { type: created.type, amount: created.amount.toString(), reason: created.reason, accountCode: account.code } });
    return created;
  });
  response.status(201).json({ data: movement });
});

salesRouter.post("/shifts/:shiftId/close", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ closingCash: z.coerce.number().min(0) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter the counted closing cash.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const shift = await prisma.cashShift.findFirst({ where: { id: request.params.shiftId as string, businessId: auth.businessId, userId: auth.userId, closedAt: null }, include: { sales: { include: { payments: { include: { payment: true } }, refunds: true } }, movements: true, branch: { select: { name: true } }, user: { select: { name: true } } } });
  if (!shift) throw new ApiError(404, "Open shift not found.", "SHIFT_NOT_FOUND");
  const cashReceived = shift.sales.reduce((sum, sale) => sum + sale.payments.filter((entry) => entry.payment.method === "CASH" && entry.payment.status === "SUCCEEDED").reduce((total, entry) => total + Number(entry.amount), 0), 0);
  const cashMovements = shift.movements.reduce((sum, movement) => sum + (movement.type === "PAID_IN" ? Number(movement.amount) : -Number(movement.amount)), 0);
  const cashRefunds = shift.sales.reduce((sum, sale) => sum + sale.refunds.filter((refund) => refund.method === "CASH" && refund.status === "SUCCEEDED").reduce((subtotal, refund) => subtotal + Number(refund.amount), 0), 0);
  const expected = Number(shift.openingCash) + cashReceived - cashRefunds + cashMovements;
  const grossSales = shift.sales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const totalRefunds = shift.sales.reduce((sum, sale) => sum + sale.refunds.filter((refund) => refund.status === "SUCCEEDED").reduce((subtotal, refund) => subtotal + Number(refund.amount), 0), 0);
  const closed = await prisma.$transaction(async (transaction) => {
    const result = await transaction.cashShift.update({ where: { id: shift.id }, data: { closingCash: parsed.data.closingCash, expectedClosingCash: expected, closedAt: new Date(), openKey: null } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CASH_SHIFT_CLOSED", entityType: "CashShift", entityId: shift.id, before: { expectedClosingCash: expected }, after: { closingCash: parsed.data.closingCash, variance: parsed.data.closingCash - expected } });
    const owners = await transaction.user.findMany({ where: { businessId: auth.businessId, role: "OWNER", isActive: true }, select: { id: true } });
    if (owners.length) await transaction.notification.createMany({ data: owners.map((owner) => ({ businessId: auth.businessId, userId: owner.id, type: "CASH_SHIFT", severity: "INFO", title: "Staff clocked out", message: `${shift.user.name} clocked out from ${shift.branch.name} on ${formatDateTime(result.closedAt ?? new Date())}. Clock-in: ${formatDateTime(shift.openedAt)}. Sales: ${shift.sales.length} transactions, gross ${formatMoney(grossSales)}, refunds ${formatMoney(totalRefunds)}, net ${formatMoney(Math.max(0, grossSales - totalRefunds))}.`, entityType: "CashShift", entityId: shift.id, dedupeKey: `SHIFT-CLOSED:${shift.id}:${owner.id}` })) });
    if (Math.abs(parsed.data.closingCash - expected) >= 0.01) {
      const variance = parsed.data.closingCash - expected;
      const difference = Math.abs(variance);
      if (owners.length) await transaction.notification.createMany({ data: owners.map((owner) => ({ businessId: auth.businessId, userId: owner.id, type: "CASH_SHIFT", severity: "WARNING", title: "Quick note", message: `${shift.user.name}'s shift at ${shift.branch.name} closed with ${formatMoney(difference)} ${variance < 0 ? "less" : "more"} cash than expected. Counted cash: ${formatMoney(parsed.data.closingCash)}. Cash in system: ${formatMoney(expected)}.`, entityType: "CashShift", entityId: shift.id, dedupeKey: `SHIFT-VARIANCE:${shift.id}:${owner.id}` })) });
    }
    return result;
  });
  response.json({ data: closed, variance: parsed.data.closingCash - expected });
});
