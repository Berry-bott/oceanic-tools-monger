import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { CUSTOMER_SESSION_COOKIE, requireCustomerAuth, type CustomerAuthContext } from "../middleware/customer-auth.js";
import { hashCustomerAccountToken, queueCustomerAccountToken } from "../lib/customer-account-tokens.js";

export const customerAccountRouter = Router();
const accountInput = z.object({ email: z.email().trim().max(254), password: z.string().min(12).max(200) });
const registerInput = accountInput.extend({ name: z.string().trim().min(2).max(180), phone: z.string().trim().max(40).optional() });
const cookieOptions = (expires: Date) => ({ httpOnly: true, secure: true, sameSite: process.env.COOKIE_SAME_SITE === "none" ? "none" as const : "lax" as const, path: "/", expires });
const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function createSession(accountId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_DAYS || 7) * 24 * 60 * 60 * 1000);
  const session = await prisma.customerSession.create({ data: { customerAccountId: accountId, tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt } });
  return { rawToken, expiresAt: session.expiresAt };
}

customerAccountRouter.post("/register", async (request, response) => {
  const parsed = registerInput.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter your name, valid email, and a password of at least 12 characters.", "VALIDATION_ERROR", parsed.error.issues);
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  if (!storeSlug) throw new ApiError(400, "Select a store to create your customer account.", "STORE_REQUIRED");
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true, storeSlug: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const email = normalizeEmail(parsed.data.email);
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  try {
    const account = await prisma.$transaction(async (transaction) => {
      const existingAccount = await transaction.customerAccount.findUnique({ where: { businessId_email: { businessId: business.id, email } } });
      if (existingAccount) throw new ApiError(409, "A customer account already uses this email.", "CUSTOMER_ACCOUNT_EXISTS");
      let customer = await transaction.customer.findFirst({ where: { businessId: business.id, email: { equals: email, mode: "insensitive" } } });
      if (!customer) customer = await transaction.customer.create({ data: { businessId: business.id, name: parsed.data.name, email, phone: parsed.data.phone } });
      if (await transaction.customerAccount.findUnique({ where: { customerId: customer.id } })) throw new ApiError(409, "This customer record is already linked to an account. Sign in with its existing account email.", "CUSTOMER_ACCOUNT_LINKED");
      const created = await transaction.customerAccount.create({ data: { businessId: business.id, customerId: customer.id, email, passwordHash }, select: { id: true, email: true, customer: { select: { id: true, name: true } } } });
      await queueCustomerAccountToken({ accountId: created.id, businessId: business.id, email: created.email, name: created.customer.name, storeSlug: business.storeSlug, purpose: "EMAIL_VERIFY" }, transaction);
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    response.status(202).json({ data: { email: account.email, verificationRequired: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2002" || error.code === "P2034")) throw new ApiError(409, "An account for this email was created concurrently. Sign in to continue.", "CUSTOMER_ACCOUNT_EXISTS");
    throw error;
  }
});

customerAccountRouter.post("/login", async (request, response) => {
  const parsed = accountInput.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a valid email and password.", "VALIDATION_ERROR", parsed.error.issues);
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  if (!storeSlug) throw new ApiError(400, "Select a store to sign in.", "STORE_REQUIRED");
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const account = await prisma.customerAccount.findUnique({ where: { businessId_email: { businessId: business.id, email: normalizeEmail(parsed.data.email) } }, include: { customer: { select: { id: true, name: true, isActive: true } } } });
  if (!account || !account.customer.isActive || !(await argon2.verify(account.passwordHash, parsed.data.password))) throw new ApiError(401, "Email or password is incorrect.", "INVALID_CUSTOMER_CREDENTIALS");
  if (!account.emailVerifiedAt) throw new ApiError(403, "Verify your email address before signing in.", "CUSTOMER_EMAIL_NOT_VERIFIED");
  const session = await createSession(account.id);
  response.cookie(CUSTOMER_SESSION_COOKIE, session.rawToken, cookieOptions(session.expiresAt));
  response.json({ data: { customer: account.customer, email: account.email, expiresAt: session.expiresAt } });
});

customerAccountRouter.post("/verify-email", async (request, response) => {
  const parsed = z.object({ token: z.string().min(20).max(200) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "This verification link is invalid or expired.", "INVALID_CUSTOMER_TOKEN");
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const tokenHash = hashCustomerAccountToken(parsed.data.token);
  const token = await prisma.customerAccountToken.findUnique({ where: { tokenHash }, include: { customerAccount: { include: { business: { select: { storeSlug: true } } } } } });
  if (!token || token.purpose !== "EMAIL_VERIFY" || token.consumedAt || token.expiresAt <= new Date() || token.customerAccount.business.storeSlug !== storeSlug) throw new ApiError(400, "This verification link is invalid or expired.", "INVALID_CUSTOMER_TOKEN");
  await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.customerAccountToken.updateMany({ where: { id: token.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (!consumed.count) throw new ApiError(400, "This verification link is invalid or expired.", "INVALID_CUSTOMER_TOKEN");
    await transaction.customerAccount.update({ where: { id: token.customerAccountId }, data: { emailVerifiedAt: new Date() } });
  });
  response.json({ data: { verified: true } });
});

customerAccountRouter.post("/resend-verification", async (request, response) => {
  const parsed = z.object({ email: z.email().trim().max(254) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a valid email address.", "VALIDATION_ERROR", parsed.error.issues);
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true, storeSlug: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const account = await prisma.customerAccount.findUnique({ where: { businessId_email: { businessId: business.id, email: normalizeEmail(parsed.data.email) } }, include: { customer: { select: { name: true } } } });
  if (account && !account.emailVerifiedAt) await queueCustomerAccountToken({ accountId: account.id, businessId: business.id, email: account.email, name: account.customer.name, storeSlug: business.storeSlug, purpose: "EMAIL_VERIFY" });
  response.json({ data: { message: "If the account needs verification, an email will be sent shortly." } });
});

customerAccountRouter.post("/forgot-password", async (request, response) => {
  const parsed = z.object({ email: z.email().trim().max(254) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a valid email address.", "VALIDATION_ERROR", parsed.error.issues);
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true, storeSlug: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const account = await prisma.customerAccount.findUnique({ where: { businessId_email: { businessId: business.id, email: normalizeEmail(parsed.data.email) } }, include: { customer: { select: { name: true } } } });
  if (account?.emailVerifiedAt) await queueCustomerAccountToken({ accountId: account.id, businessId: business.id, email: account.email, name: account.customer.name, storeSlug: business.storeSlug, purpose: "PASSWORD_RESET" });
  response.json({ data: { message: "If a verified account uses that email, a password reset link will be sent shortly." } });
});

customerAccountRouter.post("/reset-password", async (request, response) => {
  const parsed = z.object({ token: z.string().min(20).max(200), password: z.string().min(12).max(200) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Provide a valid reset link and a password of at least 12 characters.", "VALIDATION_ERROR", parsed.error.issues);
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const token = await prisma.customerAccountToken.findUnique({ where: { tokenHash: hashCustomerAccountToken(parsed.data.token) }, include: { customerAccount: { include: { business: { select: { storeSlug: true } } } } } });
  if (!token || token.purpose !== "PASSWORD_RESET" || token.consumedAt || token.expiresAt <= new Date() || token.customerAccount.business.storeSlug !== storeSlug || !token.customerAccount.emailVerifiedAt) throw new ApiError(400, "This reset link is invalid or expired.", "INVALID_CUSTOMER_TOKEN");
  const passwordHash = await argon2.hash(parsed.data.password, { type: argon2.argon2id });
  await prisma.$transaction(async (transaction) => {
    const consumed = await transaction.customerAccountToken.updateMany({ where: { id: token.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (!consumed.count) throw new ApiError(400, "This reset link is invalid or expired.", "INVALID_CUSTOMER_TOKEN");
    await transaction.customerAccount.update({ where: { id: token.customerAccountId }, data: { passwordHash } });
    await transaction.customerSession.deleteMany({ where: { customerAccountId: token.customerAccountId } });
  });
  response.json({ data: { passwordReset: true } });
});

customerAccountRouter.use(requireCustomerAuth);

customerAccountRouter.get("/me", (_request, response) => {
  const auth = response.locals.customerAuth as CustomerAuthContext;
  response.json({ data: { customerId: auth.customerId, email: auth.email } });
});

customerAccountRouter.get("/orders", async (_request, response) => {
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const orders = await prisma.onlineOrder.findMany({ where: { businessId: auth.businessId, customerEmail: auth.email }, include: { lines: true, payments: { select: { status: true, amount: true, paidAt: true, reference: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data: orders });
});

customerAccountRouter.get("/statement", async (_request, response) => {
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const sales = await prisma.sale.findMany({ where: { businessId: auth.businessId, customerId: auth.customerId, status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true, method: true, paidAt: true, reference: true } } } }, returns: { select: { total: true, reference: true, createdAt: true } } }, orderBy: { createdAt: "asc" }, take: 500 });
  const entries = sales.map((sale) => {
    const paid = sale.payments.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const credits = sale.returns.reduce((sum, entry) => sum + Number(entry.total), 0);
    return { saleId: sale.id, number: sale.number, date: sale.createdAt, dueAt: sale.dueAt, total: sale.total, paid, credits, balance: Math.max(0, Number(sale.total) - paid - credits), payments: sale.payments.filter((allocation) => allocation.payment.status === "SUCCEEDED").map((allocation) => ({ amount: allocation.amount, method: allocation.payment.method, paidAt: allocation.payment.paidAt, reference: allocation.payment.reference })), returns: sale.returns };
  });
  response.json({ data: { entries, outstanding: entries.reduce((sum, entry) => sum + entry.balance, 0) } });
});

customerAccountRouter.post("/logout", async (request, response) => {
  const cookie = request.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${CUSTOMER_SESSION_COOKIE}=`));
  const token = cookie ? decodeURIComponent(cookie.slice(CUSTOMER_SESSION_COOKIE.length + 1)) : undefined;
  if (token) await prisma.customerSession.deleteMany({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
  response.clearCookie(CUSTOMER_SESSION_COOKIE, cookieOptions(new Date(0)));
  response.status(204).end();
});
