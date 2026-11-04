import { Router } from "express";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry } from "../lib/accounting.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const customersRouter = Router();
const customerSchema = z.object({ name: z.string().trim().min(1).max(180), phone: z.string().trim().max(40).optional(), email: z.email().optional(), address: z.string().trim().max(1000).optional(), creditLimit: z.coerce.number().min(0).optional(), creditDays: z.coerce.number().int().min(0).max(365).optional(), emailRemindersAllowed: z.boolean().optional(), smsRemindersAllowed: z.boolean().optional() });
customersRouter.use(requireAuth);

customersRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const customers = await prisma.customer.findMany({ where: { businessId: auth.businessId, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { phone: { contains: search } }, { email: { contains: search, mode: "insensitive" } }] } : {}) }, include: { sales: { where: { status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } } } }, _count: { select: { sales: true } } }, orderBy: { name: "asc" }, take: 200 });
  response.json({ data: customers.map(({ sales, ...customer }) => {
    const invoiced = sales.reduce((sum, sale) => sum + Number(sale.total) - sale.returns.reduce((returnSum, entry) => returnSum + Number(entry.total), 0), 0);
    const paid = sales.reduce((sum, sale) => sum + sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((subtotal, entry) => subtotal + Number(entry.amount), 0), 0);
    return { ...customer, totalPurchases: invoiced, totalPayments: paid, outstandingBalance: invoiced - paid };
  }) });
});

customersRouter.get("/:customerId/statement", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const customer = await prisma.customer.findFirst({
    where: { id: request.params.customerId as string, businessId: auth.businessId },
    include: { sales: { include: { payments: { include: { payment: true } }, lines: true, returns: true }, orderBy: { createdAt: "desc" }, take: 100 } },
  });
  if (!customer) throw new ApiError(404, "Customer not found.", "CUSTOMER_NOT_FOUND");
  const transactions = customer.sales.flatMap((sale) => [
    { type: "SALE", saleId: sale.id, reference: sale.number, date: sale.createdAt, amount: Number(sale.total), paid: sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0), status: sale.status },
    ...sale.returns.map((entry) => ({ type: "CREDIT_NOTE", saleId: sale.id, reference: entry.reference, date: entry.createdAt, amount: -Number(entry.total), paid: 0, status: "POSTED" })),
  ]);
  response.json({ data: { customer: { id: customer.id, name: customer.name, phone: customer.phone, email: customer.email }, transactions } });
});

customersRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = customerSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the customer details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const customer = await prisma.$transaction(async (transaction) => {
    const created = await transaction.customer.create({ data: { ...parsed.data, businessId: auth.businessId } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CUSTOMER_CREATED", entityType: "Customer", entityId: created.id, after: { name: created.name } });
    return created;
  });
  response.status(201).json({ data: customer });
});

customersRouter.patch("/:customerId", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = customerSchema.partial().safeParse(request.body);
  if (!parsed.success || !Object.keys(parsed.success ? parsed.data : {}).length) throw new ApiError(400, "Provide valid customer fields to update.", "VALIDATION_ERROR", parsed.success ? undefined : parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const existing = await prisma.customer.findFirst({ where: { id: request.params.customerId as string, businessId: auth.businessId } });
  if (!existing) throw new ApiError(404, "Customer not found.", "CUSTOMER_NOT_FOUND");
  if (parsed.data.emailRemindersAllowed && !(parsed.data.email ?? existing.email)) throw new ApiError(400, "Add an email address before enabling email reminders.", "EMAIL_REQUIRED_FOR_CONSENT");
  if (parsed.data.smsRemindersAllowed && !(parsed.data.phone ?? existing.phone)) throw new ApiError(400, "Add a phone number before enabling SMS reminders.", "PHONE_REQUIRED_FOR_CONSENT");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.customer.update({ where: { id: existing.id }, data: parsed.data });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CUSTOMER_UPDATED", entityType: "Customer", entityId: existing.id, before: { name: existing.name, phone: existing.phone, emailRemindersAllowed: existing.emailRemindersAllowed, smsRemindersAllowed: existing.smsRemindersAllowed }, after: { name: result.name, phone: result.phone, emailRemindersAllowed: result.emailRemindersAllowed, smsRemindersAllowed: result.smsRemindersAllowed } });
    return result;
  });
  response.json({ data: updated });
});

const allocationSchema = z.object({ saleId: z.string(), amount: z.coerce.number().positive() });
const paymentSchema = z.object({ method: z.enum(["CASH", "BANK_TRANSFER", "CARD", "OTHER"]), reference: z.string().trim().min(1).max(80), allocations: z.array(allocationSchema).min(1) });

customersRouter.post("/:customerId/payments", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = paymentSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the payment details and allocations.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const customer = await prisma.customer.findFirst({ where: { id: request.params.customerId as string, businessId: auth.businessId }, select: { id: true } });
  if (!customer) throw new ApiError(404, "Customer not found.", "CUSTOMER_NOT_FOUND");
  const allocationTotal = parsed.data.allocations.reduce((sum, item) => sum + item.amount, 0);
  if (new Set(parsed.data.allocations.map((item) => item.saleId)).size !== parsed.data.allocations.length) throw new ApiError(400, "A sale can appear only once per payment allocation.", "DUPLICATE_ALLOCATION");
  const sales = await prisma.sale.findMany({ where: { id: { in: parsed.data.allocations.map((item) => item.saleId) }, businessId: auth.businessId, customerId: customer.id, status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true } } } } } });
  if (sales.length !== parsed.data.allocations.length) throw new ApiError(404, "One or more sales do not belong to this customer.", "SALE_NOT_FOUND");
  for (const allocation of parsed.data.allocations) {
    const sale = sales.find((entry) => entry.id === allocation.saleId)!;
    const paid = sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credited = await prisma.saleReturn.aggregate({ where: { saleId: sale.id }, _sum: { total: true } });
    if (paid + allocation.amount > Number(sale.total) - Number(credited._sum.total ?? 0)) throw new ApiError(409, "Payment allocation exceeds the outstanding sale balance.", "OVER_ALLOCATION");
  }
  const payment = await prisma.$transaction(async (transaction) => {
    for (const allocation of parsed.data.allocations) {
      const sale = sales.find((entry) => entry.id === allocation.saleId)!;
      const [paid, credited] = await Promise.all([
        transaction.salePaymentAllocation.aggregate({ where: { saleId: sale.id, payment: { status: "SUCCEEDED" } }, _sum: { amount: true } }),
        transaction.saleReturn.aggregate({ where: { saleId: sale.id }, _sum: { total: true } }),
      ]);
      if (Number(paid._sum.amount ?? 0) + allocation.amount > Number(sale.total) - Number(credited._sum.total ?? 0)) throw new ApiError(409, "Sale balance changed. Reload and retry the payment allocation.", "OVER_ALLOCATION");
    }
    const created = await transaction.payment.create({ data: { businessId: auth.businessId, method: parsed.data.method, status: "SUCCEEDED", amount: new Prisma.Decimal(allocationTotal), reference: parsed.data.reference, paidAt: new Date(), saleAllocations: { create: parsed.data.allocations.map((entry) => ({ saleId: entry.saleId, amount: entry.amount })) } } });
    await postLedgerEntry(transaction, { businessId: auth.businessId, userId: auth.userId, sourceType: "CUSTOMER_PAYMENT", sourceId: created.id, description: `Customer payment ${created.reference}`, lines: [{ code: parsed.data.method === "CASH" ? "1000" : "1010", debit: allocationTotal, description: "Customer payment received" }, { code: "1100", credit: allocationTotal, description: "Reduce customer receivable" }] });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CUSTOMER_PAYMENT_RECORDED", entityType: "Payment", entityId: created.id, after: { customerId: customer.id, amount: allocationTotal, allocationCount: parsed.data.allocations.length } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ data: payment });
});

customersRouter.get("/:customerId/reminders", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const customer = await prisma.customer.findFirst({ where: { id: request.params.customerId as string, businessId: auth.businessId }, select: { id: true } });
  if (!customer) throw new ApiError(404, "Customer not found.", "CUSTOMER_NOT_FOUND");
  const data = await prisma.notification.findMany({ where: { businessId: auth.businessId, entityType: "Customer", entityId: customer.id }, include: { deliveries: { orderBy: { createdAt: "desc" } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data });
});

customersRouter.post("/:customerId/reminders", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ channels: z.array(z.enum(["EMAIL", "SMS"])).min(1).max(2) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose one or more reminder channels.", "VALIDATION_ERROR", parsed.error.issues);
  if (new Set(parsed.data.channels).size !== parsed.data.channels.length) throw new ApiError(400, "Reminder channels must be unique.", "DUPLICATE_CHANNEL");
  const auth = response.locals.auth as AuthContext;
  const customer = await prisma.customer.findFirst({ where: { id: request.params.customerId as string, businessId: auth.businessId }, select: { id: true, name: true, email: true, phone: true, emailRemindersAllowed: true, smsRemindersAllowed: true, sales: { where: { status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } } } } } });
  if (!customer) throw new ApiError(404, "Customer not found.", "CUSTOMER_NOT_FOUND");
  const balance = customer.sales.reduce((sum, sale) => {
    const paid = sale.payments.filter((item) => item.payment.status === "SUCCEEDED").reduce((part, item) => part + Number(item.amount), 0);
    const credits = sale.returns.reduce((part, item) => part + Number(item.total), 0);
    return sum + Math.max(0, Number(sale.total) - paid - credits);
  }, 0);
  if (balance <= 0) throw new ApiError(409, "This customer has no outstanding balance to remind about.", "NO_OUTSTANDING_BALANCE");
  for (const channel of parsed.data.channels) {
    if (channel === "EMAIL" && (!customer.email || !customer.emailRemindersAllowed)) throw new ApiError(400, "The customer has not consented to email reminders or has no email address.", "EMAIL_REMINDER_NOT_ALLOWED");
    if (channel === "SMS" && (!customer.phone || !customer.smsRemindersAllowed)) throw new ApiError(400, "The customer has not consented to SMS reminders or has no phone number.", "SMS_REMINDER_NOT_ALLOWED");
  }
  const notification = await prisma.$transaction(async (transaction) => {
    const created = await transaction.notification.create({ data: {
      businessId: auth.businessId, type: "CUSTOMER_DEBT", severity: "INFO", title: "Customer debt reminder",
      message: `Hello ${customer.name}, this is a reminder that your current outstanding balance is ${balance.toLocaleString("en-NG", { maximumFractionDigits: 2 })}. Please contact us if you have already made payment.`,
      entityType: "Customer", entityId: customer.id,
      deliveries: { create: parsed.data.channels.map((channel) => ({ channel, destination: channel === "EMAIL" ? customer.email! : customer.phone!, provider: channel === "EMAIL" ? "RESEND" : "TERMII" })) },
    } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CUSTOMER_DEBT_REMINDER_QUEUED", entityType: "Customer", entityId: customer.id, after: { notificationId: created.id, channels: parsed.data.channels, balance } });
    return created;
  });
  response.status(202).json({ data: notification, currentOutstandingBalance: balance });
});
