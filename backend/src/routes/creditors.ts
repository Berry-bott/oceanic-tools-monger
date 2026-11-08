import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireRoles, requireStaffAccess, type AuthContext } from "../middleware/auth.js";

export const creditorsRouter = Router();
creditorsRouter.use(requireAuth, requireStaffAccess("SENIOR_STAFF"));

const creditorSchema = z.object({
  type: z.enum(["PERSONAL", "COMPANY"]),
  name: z.string().trim().min(1).max(180),
  companyName: z.string().trim().max(180).optional(),
  contactPerson: z.string().trim().max(180).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.email().optional().or(z.literal("")),
  address: z.string().trim().max(1000).optional(),
  creditLimit: z.coerce.number().min(0),
  creditDays: z.coerce.number().int().min(1).max(365),
}).superRefine((value, context) => {
  if (value.type === "COMPANY" && !value.companyName?.trim()) {
    context.addIssue({ code: "custom", path: ["companyName"], message: "Enter the company name." });
  }
});

const outstandingFor = (sale: { total: unknown; payments: { amount: unknown; payment: { status: string } }[]; returns: { total: unknown }[] }) => {
  const paid = sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
  const returned = sale.returns.reduce((sum, entry) => sum + Number(entry.total), 0);
  return Math.max(0, Number(sale.total) - paid - returned);
};

creditorsRouter.get("/", requireRoles("OWNER", "STAFF"), async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const customers = await prisma.customer.findMany({
    where: { businessId: auth.businessId, isCreditor: true },
    include: {
      sales: {
        where: { status: { not: "CANCELLED" } },
        include: { branch: { select: { id: true, name: true } }, payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } }, lines: { select: { productName: true, quantity: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { name: "asc" },
  });
  response.json({ data: customers.map((customer) => {
    const balance = customer.sales.reduce((sum, sale) => sum + outstandingFor(sale), 0);
    const overdue = customer.sales.filter((sale) => sale.dueAt && sale.dueAt < new Date()).reduce((sum, sale) => sum + outstandingFor(sale), 0);
    return { ...customer, outstandingBalance: balance, overdueBalance: overdue };
  }) });
});

creditorsRouter.post("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = creditorSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check the creditor details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const input = parsed.data;
  const created = await prisma.$transaction(async (transaction) => {
    const customer = await transaction.customer.create({ data: {
      businessId: auth.businessId,
      name: input.type === "COMPANY" ? input.companyName!.trim() : input.name,
      type: input.type,
      companyName: input.type === "COMPANY" ? input.companyName!.trim() : null,
      contactPerson: input.contactPerson?.trim() || null,
      phone: input.phone || null,
      email: input.email || null,
      address: input.address || null,
      creditLimit: input.creditLimit,
      creditDays: input.creditDays,
      isCreditor: true,
    } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CREDITOR_CREATED", entityType: "Customer", entityId: customer.id, after: { type: customer.type, name: customer.name, creditLimit: customer.creditLimit?.toString() ?? null, creditDays: customer.creditDays } });
    return customer;
  });
  response.status(201).json({ data: created });
});

creditorsRouter.patch("/:customerId", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = creditorSchema.partial().safeParse(request.body);
  if (!parsed.success || !Object.keys(parsed.success ? parsed.data : {}).length) throw new ApiError(400, "Provide valid creditor details to update.", "VALIDATION_ERROR", parsed.success ? undefined : parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const existing = await prisma.customer.findFirst({ where: { id: request.params.customerId as string, businessId: auth.businessId, isCreditor: true } });
  if (!existing) throw new ApiError(404, "Creditor not found.", "CREDITOR_NOT_FOUND");
  const input = parsed.data;
  const updated = await prisma.$transaction(async (transaction) => {
    const customer = await transaction.customer.update({ where: { id: existing.id }, data: {
      ...input,
      ...(input.type === "COMPANY" && input.companyName ? { name: input.companyName, companyName: input.companyName } : {}),
      ...(input.type === "PERSONAL" ? { companyName: null } : {}),
      ...(input.email === "" ? { email: null } : {}),
    } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "CREDITOR_UPDATED", entityType: "Customer", entityId: existing.id, before: { name: existing.name, type: existing.type }, after: { name: customer.name, type: customer.type } });
    return customer;
  });
  response.json({ data: updated });
});
