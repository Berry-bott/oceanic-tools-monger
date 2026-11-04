import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry, type LedgerLine } from "../lib/accounting.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const paymentsRouter = Router();
export const expensesRouter = Router();
export const accountingRouter = Router();
const paymentInput = z.object({ amount: z.coerce.number().positive(), method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), reference: z.string().trim().min(1).max(80) });
const paymentRef = (prefix: string) => `${prefix}-${randomUUID().slice(0, 12).toUpperCase()}`;

paymentsRouter.use(requireAuth);
paymentsRouter.get("/payables", requireRoles("OWNER", "STAFF"), async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const invoices = await prisma.supplierInvoice.findMany({ where: { businessId: auth.businessId }, include: { supplier: { select: { id: true, name: true } }, allocations: { include: { payment: { select: { status: true } } } }, returns: { select: { creditAmount: true } } }, orderBy: { dueAt: "asc" }, take: 500 });
  const data = invoices.map((invoice) => {
    const paid = invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const credits = invoice.returns.reduce((sum, entry) => sum + Number(entry.creditAmount), 0);
    return { ...invoice, paid, credits, outstanding: Math.max(0, Number(invoice.totalAmount) - paid - credits), overdue: Boolean(invoice.dueAt && invoice.dueAt < new Date() && Number(invoice.totalAmount) - paid - credits > 0) };
  });
  response.json({ data, summary: { totalOutstanding: data.reduce((sum, invoice) => sum + invoice.outstanding, 0), overdue: data.filter((invoice) => invoice.overdue).reduce((sum, invoice) => sum + invoice.outstanding, 0) } });
});

paymentsRouter.get("/settlements", requireRoles("OWNER", "STAFF"), async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({ data: await prisma.gatewaySettlement.findMany({ where: { businessId: auth.businessId }, include: { lines: { include: { payment: { select: { providerReference: true, amount: true, status: true } } } }, createdBy: { select: { name: true } } }, orderBy: { settledAt: "desc" }, take: 100 }) });
});

paymentsRouter.post("/settlements", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ provider: z.string().trim().min(1).max(30), reference: z.string().trim().min(1).max(80), settledAt: z.coerce.date(), lines: z.array(z.object({ paymentReference: z.string().trim().min(1).max(80), grossAmount: z.coerce.number().positive(), feeAmount: z.coerce.number().min(0) })).min(1).max(500) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the settlement reference and transaction lines.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  if (new Set(parsed.data.lines.map((line) => line.paymentReference)).size !== parsed.data.lines.length) throw new ApiError(400, "A payment can only appear once in a settlement.", "DUPLICATE_SETTLEMENT_LINE");
  const payments = await prisma.payment.findMany({ where: { businessId: auth.businessId, provider: parsed.data.provider.toUpperCase(), providerReference: { in: parsed.data.lines.map((line) => line.paymentReference) }, status: "SUCCEEDED" }, include: { settlementLines: true } });
  if (payments.length !== parsed.data.lines.length) throw new ApiError(404, "One or more successful provider payments were not found.", "SETTLEMENT_PAYMENT_NOT_FOUND");
  if (payments.some((payment) => payment.settlementLines.length > 0)) throw new ApiError(409, "A payment is already included in a settlement.", "PAYMENT_ALREADY_SETTLED");
  for (const line of parsed.data.lines) {
    const payment = payments.find((item) => item.providerReference === line.paymentReference)!;
    if (Math.abs(Number(payment.amount) - line.grossAmount) > 0.01) throw new ApiError(409, "Settlement gross amount does not match the verified payment.", "SETTLEMENT_AMOUNT_MISMATCH", { paymentReference: line.paymentReference });
    if (line.feeAmount > line.grossAmount) throw new ApiError(400, "Settlement fee cannot exceed gross amount.", "INVALID_SETTLEMENT_FEE");
  }
  const gross = Number(parsed.data.lines.reduce((sum, line) => sum + line.grossAmount, 0).toFixed(2));
  const fee = Number(parsed.data.lines.reduce((sum, line) => sum + line.feeAmount, 0).toFixed(2));
  const net = Number((gross - fee).toFixed(2));
  const settlement = await prisma.$transaction(async (transaction) => {
    const created = await transaction.gatewaySettlement.create({ data: { businessId: auth.businessId, createdById: auth.userId, provider: parsed.data.provider.toUpperCase(), reference: parsed.data.reference, settledAt: parsed.data.settledAt, grossAmount: gross, feeAmount: fee, netAmount: net, lines: { create: parsed.data.lines.map((line) => ({ paymentId: payments.find((payment) => payment.providerReference === line.paymentReference)!.id, grossAmount: line.grossAmount, feeAmount: line.feeAmount })) } } });
    for (const line of parsed.data.lines) {
      const payment = payments.find((item) => item.providerReference === line.paymentReference)!;
      await transaction.payment.update({ where: { id: payment.id }, data: { fee: line.feeAmount } });
    }
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "GATEWAY_SETTLEMENT", sourceId: created.id, description: `Gateway settlement ${created.reference}`, postingDate: created.settledAt, lines: [{ code: "1010", debit: net, description: "Net amount settled to bank" }, ...(fee ? [{ code: "6200", debit: fee, description: "Payment processor fee" }] : []), { code: "1020", credit: gross, description: "Clear gateway receivable" }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "GATEWAY_SETTLEMENT_RECONCILED", entityType: "GatewaySettlement", entityId: created.id, after: { reference: created.reference, gross, fee, net } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: settlement });
});

paymentsRouter.post("/supplier-invoices/:invoiceId/payments", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = paymentInput.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the payment details.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const invoice = await prisma.supplierInvoice.findFirst({ where: { id: request.params.invoiceId as string, businessId: auth.businessId }, include: { allocations: { include: { payment: { select: { status: true } } } }, returns: { select: { creditAmount: true } } } });
  if (!invoice) throw new ApiError(404, "Supplier invoice not found.", "INVOICE_NOT_FOUND");
  const paid = invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
  const credits = invoice.returns.reduce((sum, entry) => sum + Number(entry.creditAmount), 0);
  if (paid + parsed.data.amount > Number(invoice.totalAmount) - credits + 0.001) throw new ApiError(409, "Payment exceeds the outstanding supplier balance.", "OVER_ALLOCATION");
  const payment = await prisma.$transaction(async (transaction) => {
    const existingPaid = await transaction.supplierPaymentAllocation.aggregate({ where: { supplierInvoiceId: invoice.id, payment: { status: "SUCCEEDED" } }, _sum: { amount: true } });
    if (Number(existingPaid._sum.amount ?? 0) + parsed.data.amount > Number(invoice.totalAmount) - credits + 0.001) throw new ApiError(409, "Supplier invoice balance changed. Reload and retry.", "OVER_ALLOCATION");
    const created = await transaction.payment.create({ data: { businessId: auth.businessId, method: parsed.data.method, status: "SUCCEEDED", amount: parsed.data.amount, reference: parsed.data.reference, paidAt: new Date(), supplierAllocations: { create: { supplierInvoiceId: invoice.id, amount: parsed.data.amount } } } });
    const creditCode = parsed.data.method === "CASH" ? "1000" : "1010";
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "SUPPLIER_PAYMENT", sourceId: created.id, description: `Payment to supplier invoice ${invoice.invoiceNumber}`, lines: [{ code: "2000", debit: parsed.data.amount, description: "Reduce accounts payable" }, { code: creditCode, credit: parsed.data.amount, description: "Supplier payment" }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "SUPPLIER_PAYMENT_RECORDED", entityType: "Payment", entityId: created.id, after: { invoiceId: invoice.id, amount: parsed.data.amount, method: parsed.data.method } });
    return created;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  response.status(201).json({ data: payment });
});

expensesRouter.use(requireAuth);
expensesRouter.get("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const from = typeof request.query.from === "string" ? new Date(request.query.from) : undefined;
  const to = typeof request.query.to === "string" ? new Date(request.query.to) : undefined;
  const data = await prisma.expense.findMany({ where: { businessId: auth.businessId, ...(from || to ? { incurredAt: { ...(from && !Number.isNaN(from.valueOf()) ? { gte: from } : {}), ...(to && !Number.isNaN(to.valueOf()) ? { lte: to } : {}) } } : {}) }, include: { user: { select: { name: true } }, payment: { select: { method: true, reference: true, status: true } } }, orderBy: { incurredAt: "desc" }, take: 300 });
  response.json({ data });
});

expensesRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ category: z.string().trim().min(1).max(100), description: z.string().trim().min(1).max(500), amount: z.coerce.number().positive(), method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), reference: z.string().trim().min(1).max(80), branchId: z.string().optional(), incurredAt: z.coerce.date().optional() }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the expense details and payment method.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const input = parsed.data;
  if (input.branchId && !await prisma.branch.findFirst({ where: { id: input.branchId, businessId: auth.businessId } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const expense = await prisma.$transaction(async (transaction) => {
    const payment = await transaction.payment.create({ data: { businessId: auth.businessId, method: input.method, status: "SUCCEEDED", amount: input.amount, reference: input.reference, paidAt: new Date() } });
    const created = await transaction.expense.create({ data: { businessId: auth.businessId, branchId: input.branchId, userId: auth.userId, paymentId: payment.id, category: input.category, description: input.description, amount: input.amount, incurredAt: input.incurredAt } });
    const creditCode = input.method === "CASH" ? "1000" : "1010";
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "EXPENSE", sourceId: created.id, description: input.description, lines: [{ code: "6000", debit: input.amount, description: input.category }, { code: creditCode, credit: input.amount, description: `${input.method} paid` }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "EXPENSE_RECORDED", entityType: "Expense", entityId: created.id, after: { amount: input.amount, category: input.category } });
    return created;
  });
  response.status(201).json({ data: expense });
});

accountingRouter.use(requireAuth);
accountingRouter.get("/accounts", requireRoles("OWNER", "STAFF"), async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({ data: await prisma.account.findMany({ where: { businessId: auth.businessId }, orderBy: { code: "asc" } }) });
});
accountingRouter.get("/journal-entries", requireRoles("OWNER", "STAFF"), async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({ data: await prisma.journalEntry.findMany({ where: { businessId: auth.businessId }, include: { lines: { include: { account: { select: { code: true, name: true, type: true } } } }, createdBy: { select: { name: true } } }, orderBy: { postingDate: "desc" }, take: 200 }) });
});

const journalInput = z.object({ reference: z.string().trim().min(1).max(50), description: z.string().trim().min(1).max(500), postingDate: z.coerce.date(), lines: z.array(z.object({ accountId: z.string(), debit: z.coerce.number().min(0).default(0), credit: z.coerce.number().min(0).default(0), description: z.string().max(500).optional() })).min(2).max(100) });
accountingRouter.post("/journal-entries", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = journalInput.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the journal entry and lines.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const totalDebit = parsed.data.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = parsed.data.lines.reduce((sum, line) => sum + line.credit, 0);
  if (Math.round(totalDebit * 100) !== Math.round(totalCredit * 100) || parsed.data.lines.some((line) => (line.debit > 0) === (line.credit > 0))) throw new ApiError(400, "Debits must equal credits, and each line must contain only one side.", "UNBALANCED_JOURNAL");
  const accountIds = [...new Set(parsed.data.lines.map((line) => line.accountId))];
  const accounts = await prisma.account.findMany({ where: { id: { in: accountIds }, businessId: auth.businessId, isActive: true }, select: { id: true } });
  if (accounts.length !== accountIds.length) throw new ApiError(400, "Every journal account must be active and belong to this business.", "INVALID_ACCOUNT");
  const entry = await prisma.$transaction(async (transaction) => {
    const created = await transaction.journalEntry.create({ data: { businessId: auth.businessId, createdById: auth.userId, reference: parsed.data.reference, description: parsed.data.description, postingDate: parsed.data.postingDate, status: "DRAFT", lines: { create: parsed.data.lines } } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "JOURNAL_DRAFT_CREATED", entityType: "JournalEntry", entityId: created.id, after: { reference: created.reference, debit: totalDebit, credit: totalCredit } });
    return created;
  });
  response.status(201).json({ data: entry });
});

accountingRouter.post("/journal-entries/:entryId/post", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const entry = await prisma.journalEntry.findFirst({ where: { id: request.params.entryId as string, businessId: auth.businessId }, include: { lines: true } });
  if (!entry) throw new ApiError(404, "Journal entry not found.", "JOURNAL_NOT_FOUND");
  if (entry.status !== "DRAFT") throw new ApiError(409, "Only draft journal entries can be posted.", "INVALID_JOURNAL_TRANSITION");
  const debits = entry.lines.reduce((sum, line) => sum.add(line.debit), new Prisma.Decimal(0));
  const credits = entry.lines.reduce((sum, line) => sum.add(line.credit), new Prisma.Decimal(0));
  if (!debits.equals(credits) || debits.isZero() || entry.lines.some((line) => line.debit.greaterThan(0) === line.credit.greaterThan(0))) throw new ApiError(409, "Journal entry is not balanced.", "UNBALANCED_JOURNAL");
  const posted = await prisma.$transaction(async (transaction) => {
    const result = await transaction.journalEntry.update({ where: { id: entry.id }, data: { status: "POSTED", postedAt: new Date() } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "JOURNAL_POSTED", entityType: "JournalEntry", entityId: entry.id, before: { status: "DRAFT" }, after: { status: "POSTED" } });
    return result;
  });
  response.json({ data: posted });
});

accountingRouter.post("/journal-entries/:entryId/reverse", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const entry = await prisma.journalEntry.findFirst({ where: { id: request.params.entryId as string, businessId: auth.businessId }, include: { lines: true } });
  if (!entry || entry.status !== "POSTED") throw new ApiError(404, "Posted journal entry not found.", "POSTED_JOURNAL_NOT_FOUND");
  if (await prisma.journalEntry.findFirst({ where: { reversedEntryId: entry.id } })) throw new ApiError(409, "This journal entry has already been reversed.", "ALREADY_REVERSED");
  const reversal = await prisma.$transaction(async (transaction) => {
    await transaction.journalEntry.update({ where: { id: entry.id }, data: { status: "REVERSED" } });
    const created = await transaction.journalEntry.create({ data: { businessId: auth.businessId, createdById: auth.userId, reference: `REV-${randomUUID().slice(0, 12).toUpperCase()}`, sourceType: "REVERSAL", sourceId: entry.id, description: `Reversal of ${entry.reference}`, postingDate: new Date(), status: "POSTED", postedAt: new Date(), reversedEntryId: entry.id, lines: { create: entry.lines.map((line) => ({ accountId: line.accountId, debit: line.credit, credit: line.debit, description: `Reversal: ${line.description ?? entry.description}` })) } } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "JOURNAL_REVERSED", entityType: "JournalEntry", entityId: entry.id, after: { reversalId: created.id } });
    return created;
  });
  response.status(201).json({ data: reversal });
});
