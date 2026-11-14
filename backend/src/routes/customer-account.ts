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

async function resolveBusiness(storeQuery?: unknown) {
  const storeSlug = typeof storeQuery === "string" && storeQuery.trim()
    ? storeQuery.trim()
    : (process.env.BUSINESS_SLUG || "oceanic-tools-monger");

  const business = await prisma.business.findFirst({
    where: storeSlug ? { storeSlug } : {},
    select: { id: true, storeSlug: true, name: true },
  });
  if (!business) {
    const anyBusiness = await prisma.business.findFirst({ select: { id: true, storeSlug: true, name: true } });
    if (!anyBusiness) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
    return anyBusiness;
  }
  return business;
}

async function createSession(accountId: string) {
  const rawToken = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + Number(process.env.SESSION_TTL_DAYS || 7) * 24 * 60 * 60 * 1000);
  const session = await prisma.customerSession.create({ data: { customerAccountId: accountId, tokenHash: createHash("sha256").update(rawToken).digest("hex"), expiresAt } });
  return { rawToken, expiresAt: session.expiresAt };
}

customerAccountRouter.post("/register", async (request, response) => {
  const parsed = registerInput.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter your name, valid email, and a password of at least 12 characters.", "VALIDATION_ERROR", parsed.error.issues);
  const business = await resolveBusiness(request.query.store);
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
  const business = await resolveBusiness(request.query.store);
  const account = await prisma.customerAccount.findUnique({ where: { businessId_email: { businessId: business.id, email: normalizeEmail(parsed.data.email) } }, include: { customer: { select: { id: true, name: true, phone: true, address: true, avatarUrl: true, isActive: true } } } });
  if (!account || !account.customer.isActive || !(await argon2.verify(account.passwordHash, parsed.data.password))) throw new ApiError(401, "Email or password is incorrect.", "INVALID_CUSTOMER_CREDENTIALS");
  if (!account.emailVerifiedAt) throw new ApiError(403, "Verify your email address before signing in.", "CUSTOMER_EMAIL_NOT_VERIFIED");
  const session = await createSession(account.id);
  response.cookie(CUSTOMER_SESSION_COOKIE, session.rawToken, cookieOptions(session.expiresAt));
  response.json({ data: { customer: account.customer, email: account.email, expiresAt: session.expiresAt } });
});

// Google Identity Services (GIS) Sign-In / Sign-Up
customerAccountRouter.post("/google", async (request, response) => {
  const parsed = z.object({
    credential: z.string().min(10),
  }).safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "Google credential token is required.", "VALIDATION_ERROR", parsed.error.issues);
  }

  const business = await resolveBusiness(request.query.store);

  // Validate Google ID token via Google TokenInfo API
  let googleUser: { email: string; name?: string; sub: string; email_verified?: string | boolean; picture?: string };
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(parsed.data.credential)}`, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // Allow development mock credentials for local testing without cloud console client
      if (process.env.NODE_ENV !== "production" && parsed.data.credential.startsWith("dev-mock-google-token:")) {
        const parts = parsed.data.credential.split(":");
        googleUser = {
          email: parts[1] || "customer@example.com",
          name: parts[2] || "Google User",
          sub: "mock-google-id-" + Date.now(),
          email_verified: true,
        };
      } else {
        throw new Error(`Google token validation failed (HTTP ${res.status})`);
      }
    } else {
      googleUser = await res.json();
      if (process.env.GOOGLE_CLIENT_ID && (googleUser as any).aud && (googleUser as any).aud !== process.env.GOOGLE_CLIENT_ID) {
        throw new Error("Google token audience mismatch.");
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production" && parsed.data.credential.startsWith("dev-mock-google-token:")) {
      const parts = parsed.data.credential.split(":");
      googleUser = {
        email: parts[1] || "customer@example.com",
        name: parts[2] || "Google User",
        sub: "mock-google-id-" + Date.now(),
        email_verified: true,
      };
    } else {
      throw new ApiError(401, "Google sign in verification failed. Please try again.", "INVALID_GOOGLE_CREDENTIAL");
    }
  }

  const email = normalizeEmail(googleUser.email);
  if (!email) throw new ApiError(400, "Could not obtain email address from Google.", "INVALID_GOOGLE_CREDENTIAL");

  // Upsert or retrieve customer account
  const account = await prisma.$transaction(async (transaction) => {
    let existingAccount = await transaction.customerAccount.findUnique({
      where: { businessId_email: { businessId: business.id, email } },
      include: { customer: true },
    });

    if (existingAccount) {
      if (!existingAccount.emailVerifiedAt) {
        existingAccount = await transaction.customerAccount.update({
          where: { id: existingAccount.id },
          data: { emailVerifiedAt: new Date() },
          include: { customer: true },
        });
      }
      return existingAccount;
    }

    let customer = await transaction.customer.findFirst({
      where: { businessId: business.id, email: { equals: email, mode: "insensitive" } },
    });
    if (!customer) {
      customer = await transaction.customer.create({
        data: {
          businessId: business.id,
          name: googleUser.name || email.split("@")[0],
          email,
        },
      });
    }

    const randomPassword = randomBytes(32).toString("hex");
    const passwordHash = await argon2.hash(randomPassword, { type: argon2.argon2id });

    return transaction.customerAccount.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        email,
        passwordHash,
        emailVerifiedAt: new Date(),
      },
      include: { customer: true },
    });
  });

  const session = await createSession(account.id);
  response.cookie(CUSTOMER_SESSION_COOKIE, session.rawToken, cookieOptions(session.expiresAt));
  response.json({
    data: {
      customer: {
        id: account.customer.id,
        name: account.customer.name,
        phone: account.customer.phone,
        address: account.customer.address,
        avatarUrl: account.customer.avatarUrl,
      },
      email: account.email,
      expiresAt: session.expiresAt,
    },
  });
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

customerAccountRouter.post("/products/:productId/reviews", async (request, response) => {
  const parsed = z.object({
    rating: z.coerce.number().int().min(1).max(5),
    comment: z.string().trim().max(2000).optional(),
  }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose a rating from 1 to 5 and keep your review under 2,000 characters.", "INVALID_PRODUCT_REVIEW", parsed.error.issues);
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const product = await prisma.product.findFirst({
    where: { id: request.params.productId as string, businessId: auth.businessId, state: "ACTIVE", isPublished: true },
    select: { id: true },
  });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");

  const sales = await prisma.sale.findMany({
    where: {
      businessId: auth.businessId,
      customerId: auth.customerId,
      status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
      lines: { some: { productId: product.id } },
    },
    include: {
      lines: { where: { productId: product.id }, include: { returns: { select: { quantity: true } } } },
      payments: { where: { payment: { status: "SUCCEEDED" } }, select: { amount: true } },
      returns: { select: { total: true } },
    },
  });
  const hasPaidPosPurchase = sales.some((sale) => {
    const paid = sale.payments.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const credited = sale.returns.reduce((sum, returned) => sum + Number(returned.total), 0);
    const hasUnreturnedProduct = sale.lines.some((line) =>
      Number(line.quantity) > line.returns.reduce((sum, returned) => sum + Number(returned.quantity), 0),
    );
    return hasUnreturnedProduct && paid >= Number(sale.total) - credited;
  });

  const onlineOrders = hasPaidPosPurchase ? [] : await prisma.onlineOrder.findMany({
    where: {
      businessId: auth.businessId,
      OR: [
        { customerId: auth.customerId },
        { customerEmail: { equals: auth.email, mode: "insensitive" } },
      ],
      status: { in: ["DELIVERED", "COLLECTED"] },
      lines: { some: { productId: product.id } },
      payments: { some: { status: "SUCCEEDED" } },
    },
    select: {
      total: true,
      payments: { where: { status: "SUCCEEDED" }, select: { amount: true } },
    },
  });
  const hasFulfilledOnlinePurchase = onlineOrders.some((order) =>
    order.payments.reduce((sum, payment) => sum + Number(payment.amount), 0) >= Number(order.total),
  );
  if (!hasPaidPosPurchase && !hasFulfilledOnlinePurchase) {
    throw new ApiError(403, "Only verified customers who completed a paid purchase of this product can review it.", "PRODUCT_PURCHASE_REQUIRED");
  }

  const review = await prisma.productReview.upsert({
    where: { productId_customerId: { productId: product.id, customerId: auth.customerId } },
    create: {
      businessId: auth.businessId,
      productId: product.id,
      customerId: auth.customerId,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
    },
    update: { rating: parsed.data.rating, comment: parsed.data.comment || null },
    select: { rating: true, comment: true, createdAt: true, updatedAt: true },
  });
  response.status(201).json({ data: review });
});

customerAccountRouter.get("/me", async (_request, response) => {
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const customer = await prisma.customer.findUnique({
    where: { id: auth.customerId },
    select: { id: true, name: true, email: true, phone: true, address: true, avatarUrl: true, type: true, createdAt: true },
  });
  response.json({ data: { customerId: auth.customerId, email: auth.email, customer } });
});

customerAccountRouter.put("/profile", async (request, response) => {
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const parsed = z.object({
    name: z.string().trim().min(2).max(180).optional(),
    phone: z.string().trim().max(40).optional(),
    address: z.string().trim().max(500).optional(),
    avatarUrl: z.string().nullable().optional(),
  }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter valid profile information.", "VALIDATION_ERROR", parsed.error.issues);
  const updated = await prisma.customer.update({
    where: { id: auth.customerId },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address || null } : {}),
      ...(parsed.data.avatarUrl !== undefined ? { avatarUrl: parsed.data.avatarUrl || null } : {}),
    },
    select: { id: true, name: true, email: true, phone: true, address: true, avatarUrl: true },
  });
  response.json({ data: updated });
});

customerAccountRouter.get("/orders", async (_request, response) => {
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const orders = await prisma.onlineOrder.findMany({
    where: {
      businessId: auth.businessId,
      OR: [
        { customerId: auth.customerId },
        { customerEmail: { equals: auth.email, mode: "insensitive" } },
      ],
    },
    include: {
      lines: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              category: true,
              imageUrl: true,
              productImages: {
                take: 1,
                orderBy: { position: "asc" },
                select: { mediaAsset: { select: { secureUrl: true } } },
              },
            },
          },
        },
      },
      branch: { select: { name: true, address: true } },
      payments: { select: { status: true, amount: true, paidAt: true, reference: true, method: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
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
