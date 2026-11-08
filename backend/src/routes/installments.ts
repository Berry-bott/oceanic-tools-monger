import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { postLedgerEntry, type LedgerLine } from "../lib/accounting.js";
import { writeAudit } from "../lib/audit.js";
import { consumeReservedLots, releaseReservedLots, reserveFefoLots } from "../lib/stock-lots.js";
import { requireAuth, requireRoles, requireStaffAccess, type AuthContext } from "../middleware/auth.js";

export const installmentsRouter = Router();
const reference = (prefix: string) => `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;
const addMonths = (date: Date, months: number) => {
  const result = new Date(date);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
};
const createSchema = z.object({
  branchId: z.string().min(1),
  customerId: z.string().min(1),
  count: z.coerce.number().int().min(2).max(24),
  frequency: z.enum(["WEEKLY", "MONTHLY"]).default("MONTHLY"),
  firstDueAt: z.coerce.date(),
  lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive(), unitPrice: z.coerce.number().positive() })).min(1).max(100),
});

installmentsRouter.use(requireAuth, requireStaffAccess("SENIOR_STAFF"));

async function notifyBusiness(transaction: Prisma.TransactionClient, input: { businessId: string; customerId: string; title: string; message: string; key: string; severity?: string }) {
  const customer = await transaction.customer.findFirst({ where: { id: input.customerId, businessId: input.businessId } });
  const deliveries = [
    ...(customer?.email && customer.emailRemindersAllowed ? [{ channel: "EMAIL" as const, destination: customer.email, provider: "RESEND" }] : []),
    ...(customer?.phone && customer.smsRemindersAllowed ? [{ channel: "SMS" as const, destination: customer.phone, provider: "TERMII" }] : []),
  ];
  await transaction.notification.upsert({
    where: { dedupeKey: input.key },
    create: { businessId: input.businessId, type: "INSTALLMENT", severity: input.severity ?? "INFO", title: input.title, message: input.message, entityType: "Customer", entityId: input.customerId, dedupeKey: input.key, deliveries: { create: deliveries } },
    update: { readAt: null, message: input.message, createdAt: new Date() },
  });
}

installmentsRouter.get("/", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const data = await prisma.installmentAgreement.findMany({
    where: { businessId: auth.businessId, ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}) },
    include: {
      branch: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true, email: true } },
      lines: true,
      installments: { orderBy: { sequence: "asc" }, include: { payments: { include: { payment: { select: { id: true, method: true, reference: true, paidAt: true } } } } } },
      payments: { include: { payment: { select: { id: true, method: true, reference: true, paidAt: true } } } },
      refunds: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" }, take: 200,
  });
  response.json({ data });
});

installmentsRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = createSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the customer, items, price and payment schedule.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const input = parsed.data;
  if (auth.role === "STAFF" && input.branchId !== auth.branchId) throw new ApiError(403, "You can only create agreements for your assigned branch.", "BRANCH_ACCESS_DENIED");
  if (new Set(input.lines.map((line) => line.productId)).size !== input.lines.length) throw new ApiError(400, "Add each product only once to an agreement.", "DUPLICATE_INSTALLMENT_PRODUCT");
  const [branch, customer, products] = await Promise.all([
    prisma.branch.findFirst({ where: { id: input.branchId, businessId: auth.businessId } }),
    prisma.customer.findFirst({ where: { id: input.customerId, businessId: auth.businessId, isActive: true } }),
    prisma.product.findMany({ where: { id: { in: input.lines.map((line) => line.productId) }, businessId: auth.businessId, state: "ACTIVE" }, include: { balances: { where: { branchId: input.branchId } } } }),
  ]);
  if (!branch || !customer) throw new ApiError(404, "The selected customer or branch could not be found.", "INSTALLMENT_REFERENCE_NOT_FOUND");
  if (products.length !== input.lines.length) throw new ApiError(404, "One or more selected items are unavailable.", "PRODUCT_UNAVAILABLE");
  const productMap = new Map(products.map((product) => [product.id, product]));
  const lines = input.lines.map((entry) => {
    const product = productMap.get(entry.productId)!;
    const balance = product.balances[0];
    const available = Number(balance?.onHand ?? 0) - Number(balance?.reserved ?? 0);
    if (entry.quantity > available) throw new ApiError(409, `${product.name} has only ${available} available in this branch.`, "INSUFFICIENT_STOCK");
    if (entry.unitPrice < Number(product.costPrice)) throw new ApiError(409, `${product.name} cannot be agreed below its cost price.`, "BELOW_COST_PRICE");
    return { product, quantity: entry.quantity, unitPrice: entry.unitPrice, unitCost: Number(product.costPrice), lineTotal: roundMoney(entry.quantity * entry.unitPrice) };
  });
  const total = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
  const agreement = await prisma.$transaction(async (transaction) => {
    for (const line of lines) {
      const current = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: line.product.id, branchId: branch.id } } });
      const onHand = current?.onHand ?? new Prisma.Decimal(0);
      const reserved = current?.reserved ?? new Prisma.Decimal(0);
      const available = onHand.minus(reserved);
      if (new Prisma.Decimal(line.quantity).greaterThan(available)) throw new ApiError(409, `${line.product.name} stock changed. Reload and try again.`, "STOCK_CONFLICT");
      const changed = await transaction.stockBalance.updateMany({ where: { productId: line.product.id, branchId: branch.id, onHand, reserved }, data: { reserved: { increment: line.quantity } } });
      if (changed.count !== 1) throw new ApiError(409, `${line.product.name} stock changed. Reload and try again.`, "STOCK_CONFLICT");
    }
    const created = await transaction.installmentAgreement.create({ data: {
      businessId: auth.businessId, branchId: branch.id, customerId: customer.id, createdById: auth.userId, number: reference("INST"), total, installmentCount: input.count,
      lines: { create: lines.map((line) => ({ productId: line.product.id, productName: line.product.name, sku: line.product.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) },
      installments: { create: Array.from({ length: input.count }, (_, index) => {
        const base = Math.floor((total / input.count) * 100) / 100;
        const amount = index === input.count - 1 ? roundMoney(total - base * (input.count - 1)) : base;
        const dueAt = input.frequency === "WEEKLY"
          ? new Date(input.firstDueAt.getTime() + index * 7 * 86_400_000)
          : addMonths(input.firstDueAt, index);
        return { sequence: index + 1, amount, dueAt };
      }) },
    }, include: { lines: true, installments: { orderBy: { sequence: "asc" } }, customer: { select: { name: true } }, branch: { select: { name: true } } } });
    for (const line of created.lines) {
      const reservation = await transaction.stockReservation.create({ data: { businessId: auth.businessId, branchId: branch.id, productId: line.productId, installmentAgreementId: created.id, quantity: line.quantity } });
      await reserveFefoLots(transaction, { reservationId: reservation.id, productId: line.productId, branchId: branch.id, quantity: line.quantity });
    }
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "INSTALLMENT_AGREEMENT_CREATED", entityType: "InstallmentAgreement", entityId: created.id, after: { number: created.number, total, installmentCount: input.count } });
    await notifyBusiness(transaction, { businessId: auth.businessId, customerId: customer.id, title: "Instalment agreement started", message: `${customer.name}'s agreement ${created.number} is for ${total.toLocaleString("en-NG")} with ${input.count} scheduled payments.`, key: `INSTALLMENT-STARTED:${created.id}` });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: agreement });
});

installmentsRouter.post("/:agreementId/installments/:installmentId/payments", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ amount: z.coerce.number().positive(), method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), reference: z.string().trim().min(1).max(80) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter the amount received, payment method and reference.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const agreement = await prisma.installmentAgreement.findFirst({ where: { id: request.params.agreementId as string, businessId: auth.businessId, ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}) }, include: { customer: { select: { name: true } }, lines: true, reservations: { include: { lots: true } }, installments: { include: { payments: { include: { payment: true } } } } } });
  if (!agreement || agreement.status !== "ACTIVE") throw new ApiError(404, "Active instalment agreement not found.", "INSTALLMENT_AGREEMENT_NOT_FOUND");
  const installment = agreement.installments.find((entry) => entry.id === request.params.installmentId);
  if (!installment) throw new ApiError(404, "Payment schedule item not found.", "INSTALLMENT_NOT_FOUND");
  const balance = Number(installment.amount) - Number(installment.paidAmount);
  if (parsed.data.amount > balance + 0.001) throw new ApiError(409, "Payment is more than the balance on this scheduled instalment.", "INSTALLMENT_OVERPAYMENT");
  const result = await prisma.$transaction(async (transaction) => {
    const payment = await transaction.payment.create({ data: { businessId: auth.businessId, method: parsed.data.method, status: "SUCCEEDED", amount: parsed.data.amount, reference: parsed.data.reference, paidAt: new Date() } });
    await transaction.installmentPayment.create({ data: { businessId: auth.businessId, agreementId: agreement.id, installmentId: installment.id, paymentId: payment.id, amount: parsed.data.amount } });
    const paidAmount = roundMoney(Number(installment.paidAmount) + parsed.data.amount);
    const status = paidAmount + 0.001 >= Number(installment.amount) ? "PAID" : "PARTIALLY_PAID";
    await transaction.installmentDue.update({ where: { id: installment.id }, data: { paidAmount, status } });
    await transaction.installmentAgreement.update({ where: { id: agreement.id }, data: { paidTotal: { increment: parsed.data.amount } } });
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "INSTALLMENT_PAYMENT", sourceId: payment.id, description: `Instalment payment ${agreement.number}`, lines: [{ code: parsed.data.method === "CASH" ? "1000" : "1010", debit: parsed.data.amount, description: "Customer instalment received" }, { code: "2300", credit: parsed.data.amount, description: "Customer instalment held until sale" }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "INSTALLMENT_PAYMENT_RECORDED", entityType: "InstallmentAgreement", entityId: agreement.id, after: { installmentId: installment.id, amount: parsed.data.amount, method: parsed.data.method, reference: payment.reference } });
    await notifyBusiness(transaction, { businessId: auth.businessId, customerId: agreement.customerId, title: "Instalment payment received", message: `${agreement.customer.name} paid ${parsed.data.amount.toLocaleString("en-NG")} toward agreement ${agreement.number}.`, key: `INSTALLMENT-PAYMENT:${payment.id}` });

    const allPayments = await transaction.installmentPayment.findMany({ where: { agreementId: agreement.id }, include: { payment: true } });
    const totalPaid = allPayments.reduce((sum, item) => sum + Number(item.amount), 0);
    if (totalPaid + 0.001 >= Number(agreement.total)) {
      const saleLines = [];
      let costOfGoods = 0;
      for (const line of agreement.lines) {
        const current = await transaction.stockBalance.findUnique({ where: { productId_branchId: { productId: line.productId, branchId: agreement.branchId } } });
        const qty = new Prisma.Decimal(line.quantity);
        const changed = await transaction.stockBalance.updateMany({ where: { productId: line.productId, branchId: agreement.branchId, onHand: { gte: qty }, reserved: { gte: qty } }, data: { onHand: { decrement: qty }, reserved: { decrement: qty } } });
        if (!current || changed.count !== 1) throw new ApiError(409, "Reserved stock is no longer available. Ask an owner to review this agreement.", "INSTALLMENT_STOCK_CONFLICT");
        const reservation = agreement.reservations.find((item) => item.productId === line.productId);
        if (!reservation) throw new ApiError(409, "Reserved item record is missing. Ask an owner to review this agreement.", "INSTALLMENT_RESERVATION_MISSING");
        const lots = await consumeReservedLots(transaction, reservation.id);
        for (const lot of lots) {
          const lotChange = await transaction.stockLot.updateMany({ where: { id: lot.stockLotId, quantity: { gte: lot.quantity }, reserved: { gte: lot.quantity } }, data: { quantity: { decrement: lot.quantity }, reserved: { decrement: lot.quantity } } });
          if (lotChange.count !== 1) throw new ApiError(409, "Reserved batch stock changed. Reload and try again.", "INSTALLMENT_STOCK_CONFLICT");
        }
        await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });
        const actualCost = lots.reduce((sum, lot) => sum + Number(lot.unitCost) * Number(lot.quantity), 0);
        costOfGoods += actualCost;
        saleLines.push({ line, lots, actualCost });
      }
      const sale = await transaction.sale.create({ data: { businessId: auth.businessId, branchId: agreement.branchId, userId: auth.userId, customerId: agreement.customerId, number: reference("SALE"), channel: "MANUAL", subtotal: agreement.total, total: agreement.total, lines: { create: agreement.lines.map((line) => ({ productId: line.productId, productName: line.productName, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) } }, include: { lines: true } });
      for (const { line, lots, actualCost } of saleLines) {
        const saleLine = sale.lines.find((entry) => entry.productId === line.productId)!;
        const weightedCost = actualCost / Number(line.quantity);
        await transaction.saleLine.update({ where: { id: saleLine.id }, data: { unitCost: weightedCost } });
        await transaction.saleLotAllocation.createMany({ data: lots.map((lot) => ({ saleLineId: saleLine.id, stockLotId: lot.stockLotId, quantity: lot.quantity, unitCost: lot.unitCost })) });
        await transaction.stockMovement.create({ data: { productId: line.productId, branchId: agreement.branchId, userId: auth.userId, type: "SALE", quantity: new Prisma.Decimal(line.quantity).negated(), unitCost: weightedCost, reference: sale.number, reason: `Paid instalment agreement ${agreement.number}` } });
      }
      await transaction.salePaymentAllocation.createMany({ data: allPayments.map((item) => ({ saleId: sale.id, paymentId: item.paymentId, amount: item.amount })) });
      const ledgerLines: LedgerLine[] = [{ code: "2300", debit: agreement.total, description: "Apply customer instalments to completed sale" }, { code: "4000", credit: agreement.total, description: "Sales revenue" }];
      if (costOfGoods > 0) ledgerLines.push({ code: "5000", debit: costOfGoods, description: "Cost of goods sold" }, { code: "1200", credit: costOfGoods, description: "Inventory relieved" });
      await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "SALE", sourceId: sale.id, description: `Completed instalment sale ${sale.number}`, lines: ledgerLines });
      await transaction.installmentAgreement.update({ where: { id: agreement.id }, data: { status: "COMPLETED", completedAt: new Date() } });
      await transaction.installmentDue.updateMany({ where: { agreementId: agreement.id }, data: { status: "PAID" } });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "INSTALLMENT_SALE_COMPLETED", entityType: "Sale", entityId: sale.id, after: { agreementId: agreement.id, agreementNumber: agreement.number, saleNumber: sale.number, total: Number(agreement.total) } });
      await notifyBusiness(transaction, { businessId: auth.businessId, customerId: agreement.customerId, title: "Instalment agreement fully paid", message: `Agreement ${agreement.number} is fully paid. Sale ${sale.number} has been recorded and stock deducted.`, key: `INSTALLMENT-COMPLETED:${agreement.id}`, severity: "SUCCESS" });
      return { payment, completed: true, saleNumber: sale.number };
    }
    return { payment, completed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: result });
});

installmentsRouter.post("/:agreementId/installments/:installmentId/extend", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ dueAt: z.coerce.date(), reason: z.string().trim().min(3).max(500) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter the new payment deadline and a reason.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const installment = await prisma.installmentDue.findFirst({ where: { id: request.params.installmentId as string, agreementId: request.params.agreementId as string, agreement: { businessId: auth.businessId, ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}), status: "ACTIVE" } }, include: { agreement: { include: { customer: { select: { name: true } } } } } });
  if (!installment || installment.status === "PAID" || installment.status === "CANCELLED") throw new ApiError(404, "An unpaid instalment could not be found.", "INSTALLMENT_NOT_FOUND");
  if (parsed.data.dueAt <= installment.dueAt) throw new ApiError(400, "The new deadline must be after the current deadline.", "INVALID_EXTENSION_DATE");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.installmentDue.update({ where: { id: installment.id }, data: { dueAt: parsed.data.dueAt, status: "PENDING" } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "INSTALLMENT_DEADLINE_EXTENDED", entityType: "InstallmentAgreement", entityId: installment.agreementId, reason: parsed.data.reason, before: { installmentId: installment.id, dueAt: installment.dueAt.toISOString() }, after: { dueAt: parsed.data.dueAt.toISOString() } });
    await notifyBusiness(transaction, { businessId: auth.businessId, customerId: installment.agreement.customerId, title: "Payment deadline extended", message: `Payment ${installment.sequence} for ${installment.agreement.number} is now due ${parsed.data.dueAt.toLocaleDateString("en-NG")}.`, key: `INSTALLMENT-EXTENSION:${installment.id}:${parsed.data.dueAt.toISOString()}` });
    return result;
  });
  response.json({ data: updated });
});

installmentsRouter.post("/:agreementId/cancel", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]).optional(), reference: z.string().trim().min(1).max(80).optional(), reason: z.string().trim().min(3).max(500) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter the refund method, reference and reason.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const agreement = await prisma.installmentAgreement.findFirst({ where: { id: request.params.agreementId as string, businessId: auth.businessId, ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}) }, include: { payments: { include: { payment: true } }, lines: true, reservations: true } });
  if (!agreement || agreement.status !== "ACTIVE") throw new ApiError(404, "Active instalment agreement not found.", "INSTALLMENT_AGREEMENT_NOT_FOUND");
  const refundAmount = agreement.payments.reduce((sum, item) => sum + Number(item.amount) - Number(item.refundedAmount), 0);
  if (refundAmount > 0 && (!parsed.data.method || !parsed.data.reference)) throw new ApiError(400, "Enter the refund method and reference for the instalment money being returned.", "REFUND_DETAILS_REQUIRED");
  const result = await prisma.$transaction(async (transaction) => {
    if (refundAmount > 0) {
      await transaction.installmentRefund.create({ data: { businessId: auth.businessId, agreementId: agreement.id, userId: auth.userId, reference: parsed.data.reference!, amount: refundAmount, method: parsed.data.method!, reason: parsed.data.reason } });
      for (const payment of agreement.payments) await transaction.installmentPayment.update({ where: { id: payment.id }, data: { refundedAmount: payment.amount } });
      await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "INSTALLMENT_REFUND", sourceId: agreement.id, description: `Refund for cancelled agreement ${agreement.number}`, lines: [{ code: "2300", debit: refundAmount, description: "Return customer instalments" }, { code: parsed.data.method === "CASH" ? "1000" : "1010", credit: refundAmount, description: "Refund issued to customer" }] });
    }
    for (const line of agreement.lines) {
      const reservation = agreement.reservations.find((item) => item.productId === line.productId);
      if (!reservation) throw new ApiError(409, "Reserved item record is missing. Ask an owner to review this agreement.", "INSTALLMENT_RESERVATION_MISSING");
      await releaseReservedLots(transaction, reservation.id);
      await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED" } });
      const changed = await transaction.stockBalance.updateMany({ where: { productId: line.productId, branchId: agreement.branchId, reserved: { gte: line.quantity } }, data: { reserved: { decrement: line.quantity } } });
      if (changed.count !== 1) throw new ApiError(409, "Reserved stock could not be released. Ask an owner to review this agreement.", "INSTALLMENT_STOCK_CONFLICT");
    }
    await transaction.installmentAgreement.update({ where: { id: agreement.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await transaction.installmentDue.updateMany({ where: { agreementId: agreement.id }, data: { status: "CANCELLED" } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "INSTALLMENT_AGREEMENT_CANCELLED", entityType: "InstallmentAgreement", entityId: agreement.id, reason: parsed.data.reason, after: { refundAmount, method: parsed.data.method, reference: parsed.data.reference } });
    return { refundAmount };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.json({ data: result });
});
