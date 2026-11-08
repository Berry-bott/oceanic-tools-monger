import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const businessRouter = Router();
export const usersRouter = Router();
export const branchesRouter = Router();

function hasDatabaseErrorCode(error: unknown, expectedCode: string) {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === expectedCode) return true;
    current = candidate.cause;
  }
  return false;
}

businessRouter.use(requireAuth);
usersRouter.use(requireAuth, requireRoles("OWNER"));
branchesRouter.use(requireAuth);

businessRouter.get("/", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  const data = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, include: { branches: { orderBy: { name: "asc" } } } });
  response.json({ data });
});

businessRouter.patch("/", requireRoles("OWNER"), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(180).optional(), currency: z.string().trim().length(3).transform((value) => value.toUpperCase()).optional(), timezone: z.string().trim().min(1).max(80).optional(), storeSlug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80).optional() }).safeParse(request.body);
  if (!parsed.success || !Object.keys(parsed.success ? parsed.data : {}).length) throw new ApiError(400, "Provide valid business settings to update.", "VALIDATION_ERROR", parsed.success ? undefined : parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  if (parsed.data.timezone) { try { new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone }); } catch { throw new ApiError(400, "Choose a valid IANA timezone.", "INVALID_TIMEZONE"); } }
  const before = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { name: true, currency: true, timezone: true, storeSlug: true } });
  const result = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.business.update({ where: { id: auth.businessId }, data: parsed.data });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "BUSINESS_SETTINGS_UPDATED", entityType: "Business", entityId: auth.businessId, before, after: parsed.data });
    return updated;
  });
  response.json({ data: result });
});

usersRouter.get("/", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({ data: await prisma.user.findMany({ where: { businessId: auth.businessId }, select: { id: true, name: true, email: true, role: true, staffAccessRole: true, branchId: true, branch: { select: { name: true } }, isActive: true, createdAt: true, updatedAt: true }, orderBy: { name: "asc" } }) });
});

usersRouter.post("/", async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(180), email: z.email(), password: z.string().length(6), branchId: z.string().min(1), staffAccessRole: z.enum(["CASHIER", "SENIOR_STAFF"]) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Provide a name, valid email, six-character temporary password and branch.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const branch = await prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId }, select: { id: true } });
  if (!branch) throw new ApiError(404, "Choose a branch in this business.", "BRANCH_NOT_FOUND");
  const email = parsed.data.email.trim().toLowerCase();
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new ApiError(409, "This email address is already in use.", "EMAIL_ALREADY_EXISTS");
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  let user;
  try {
    user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({ data: { businessId: auth.businessId, branchId: branch.id, name: parsed.data.name, email, passwordHash, role: "STAFF", staffAccessRole: parsed.data.staffAccessRole, mustChangePassword: true }, select: { id: true, name: true, email: true, role: true, staffAccessRole: true, branchId: true, branch: { select: { name: true } }, isActive: true, createdAt: true } });
      await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "USER_CREATED", entityType: "User", entityId: created.id, after: { email: created.email, role: created.role, branchId: created.branchId } });
      return created;
    });
  } catch (error) {
    // The previous UserRole enum does not contain STAFF. Postgres reports 22P02
    // when it rejects that role, which means the consolidation migration is pending.
    if (hasDatabaseErrorCode(error, "22P02")) {
      throw new ApiError(503, "Apply the staff access roles database migration, then retry.", "STAFF_ROLE_MIGRATION_REQUIRED");
    }
    throw error;
  }
  response.status(201).json({ data: user });
});

usersRouter.patch("/:userId", async (request, response) => {
  const parsed = z.object({ isActive: z.boolean().optional(), name: z.string().trim().min(1).max(180).optional(), branchId: z.string().min(1).optional(), staffAccessRole: z.enum(["CASHIER", "SENIOR_STAFF"]).optional() }).safeParse(request.body);
  if (!parsed.success || !Object.keys(parsed.success ? parsed.data : {}).length) throw new ApiError(400, "Provide valid user fields to update.", "VALIDATION_ERROR", parsed.success ? undefined : parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const user = await prisma.user.findFirst({ where: { id: request.params.userId as string, businessId: auth.businessId } });
  if (!user) throw new ApiError(404, "User not found.", "USER_NOT_FOUND");
  if (user.role === "OWNER") throw new ApiError(409, "Owner accounts cannot be changed here.", "OWNER_UPDATE_BLOCKED");
  if (parsed.data.branchId && !await prisma.branch.findFirst({ where: { id: parsed.data.branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Choose a branch in this business.", "BRANCH_NOT_FOUND");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.user.update({ where: { id: user.id }, data: parsed.data, select: { id: true, name: true, email: true, role: true, staffAccessRole: true, branchId: true, branch: { select: { name: true } }, isActive: true } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: parsed.data.branchId ? "USER_BRANCH_CHANGED" : "USER_UPDATED", entityType: "User", entityId: user.id, before: { role: user.role, staffAccessRole: user.staffAccessRole, isActive: user.isActive, branchId: user.branchId }, after: { role: result.role, staffAccessRole: result.staffAccessRole, isActive: result.isActive, branchId: result.branchId } });
    if (!result.isActive) await transaction.session.deleteMany({ where: { userId: result.id } });
    return result;
  });
  response.json({ data: updated });
});

// Staff records are retained for sales, payments, inventory and audit history.
// DELETE therefore disables access and revokes sessions instead of hard-deleting.
usersRouter.delete("/:userId", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const user = await prisma.user.findFirst({
    where: { id: request.params.userId as string, businessId: auth.businessId },
    select: { id: true, role: true, isActive: true },
  });
  if (!user) throw new ApiError(404, "Staff member not found.", "USER_NOT_FOUND");
  if (user.role === "OWNER") throw new ApiError(409, "Owner accounts cannot be removed here.", "OWNER_REMOVAL_BLOCKED");
  if (!user.isActive) return response.status(204).end();

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: user.id }, data: { isActive: false } });
    await transaction.session.deleteMany({ where: { userId: user.id } });
    await writeAudit(transaction, {
      businessId: auth.businessId,
      userId: auth.userId,
      action: "USER_DEACTIVATED",
      entityType: "User",
      entityId: user.id,
      before: { isActive: true },
      after: { isActive: false },
    });
  });

  response.status(204).end();
});

branchesRouter.get("/", async (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({ data: await prisma.branch.findMany({ where: { businessId: auth.businessId, ...(auth.role === "STAFF" ? { id: auth.branchId ?? "" } : {}) }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }) });
});

branchesRouter.post("/", requireRoles("OWNER"), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120), isDefault: z.boolean().default(false) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a branch name.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const branch = await prisma.$transaction(async (transaction) => {
    if (parsed.data.isDefault) await transaction.branch.updateMany({ where: { businessId: auth.businessId, isDefault: true }, data: { isDefault: false } });
    const created = await transaction.branch.create({ data: { businessId: auth.businessId, ...parsed.data } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "BRANCH_CREATED", entityType: "Branch", entityId: created.id, after: { name: created.name, isDefault: created.isDefault } });
    return created;
  }, { isolationLevel: "Serializable" });
  response.status(201).json({ data: branch });
});

branchesRouter.patch("/:branchId", requireRoles("OWNER"), async (request, response) => {
  const parsed = z.object({ name: z.string().trim().min(1).max(120).optional(), isDefault: z.boolean().optional() }).safeParse(request.body);
  if (!parsed.success || !Object.keys(parsed.success ? parsed.data : {}).length) throw new ApiError(400, "Provide valid branch fields to update.", "VALIDATION_ERROR", parsed.success ? undefined : parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const branch = await prisma.branch.findFirst({ where: { id: request.params.branchId as string, businessId: auth.businessId } });
  if (!branch) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const updated = await prisma.$transaction(async (transaction) => {
    if (parsed.data.isDefault) await transaction.branch.updateMany({ where: { businessId: auth.businessId, isDefault: true, id: { not: branch.id } }, data: { isDefault: false } });
    const result = await transaction.branch.update({ where: { id: branch.id }, data: parsed.data });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "BRANCH_UPDATED", entityType: "Branch", entityId: branch.id, before: { name: branch.name, isDefault: branch.isDefault }, after: { name: result.name, isDefault: result.isDefault } });
    return result;
  }, { isolationLevel: "Serializable" });
  response.json({ data: updated });
});
