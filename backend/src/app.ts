import cors from "cors";
import express, { type ErrorRequestHandler, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { ApiError } from "./lib/errors.js";
import { safeErrorMetadata } from "./lib/safe-error.js";
import { authRouter } from "./routes/auth.js";
import { productsRouter } from "./routes/products.js";
import { purchasesRouter, suppliersRouter } from "./routes/suppliers.js";
import { customersRouter } from "./routes/customers.js";
import { salesRouter } from "./routes/sales.js";
import { onlineOrdersRouter, paystackWebhookRouter, storeRouter } from "./routes/store.js";
import { accountingRouter, expensesRouter, paymentsRouter } from "./routes/finance.js";
import { auditRouter, notificationsRouter } from "./routes/notifications.js";
import { installmentsRouter } from "./routes/installments.js";
import { creditorsRouter } from "./routes/creditors.js";
import { reportsRouter } from "./routes/reports.js";
import { inventoryWorkflowRouter } from "./routes/inventory-workflows.js";
import { branchesRouter, businessRouter, usersRouter } from "./routes/admin.js";
import { customerAccountRouter } from "./routes/customer-account.js";
import { mediaRouter } from "./routes/media.js";
import { isAllowedFrontendOrigin } from "./lib/frontend-origins.js";

export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use((request, response, next) => {
  const requestId = randomUUID();
  response.locals.requestId = requestId;
  response.setHeader("X-Request-Id", requestId);
  next();
});
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedFrontendOrigin(origin)),
  credentials: true,
  allowedHeaders: ["Content-Type", "X-Oceanic-Workspace", "Idempotency-Key"],
  exposedHeaders: ["X-Request-Id"],
}));
app.use("/api/v1/webhooks", express.raw({ type: "application/json", limit: "1mb" }), paystackWebhookRouter);
app.use("/api/v1/products/import/xlsx/parse", express.raw({ type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", limit: "5mb" }));
app.use(express.json({ limit: "1mb" }));
app.use((request, _response, next) => {
  const origin = request.get("origin");
  if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method) && origin && !isAllowedFrontendOrigin(origin)) {
    next(new ApiError(403, "Requests from this origin are not allowed.", "INVALID_ORIGIN"));
    return;
  }
  next();
});

const rateLimitHandler = (message: string) => (_request: Request, response: Response) => {
  response.status(429).json({ error: { code: "RATE_LIMITED", message, requestId: response.locals.requestId } });
};
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, handler: rateLimitHandler("Too many sign-in attempts. Try again later.") });
const sessionRefreshLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, handler: rateLimitHandler("Too many session refresh attempts. Try again shortly.") });
const checkoutLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false, handler: rateLimitHandler("Too many checkout attempts. Try again shortly.") });
const customerAccountLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, handler: rateLimitHandler("Too many account requests. Try again later.") });
const orderTrackingLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, handler: rateLimitHandler("Too many order lookup attempts. Try again later.") });

app.get("/health", (_request, response) => response.json({ status: "ok", service: "oceanic-tools-api" }));
app.use("/api/v1/auth/login", loginLimiter);
app.use("/api/v1/auth/refresh", sessionRefreshLimiter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/customer-account/register", customerAccountLimiter);
app.use("/api/v1/customer-account/login", customerAccountLimiter);
app.use("/api/v1/customer-account/verify-email", customerAccountLimiter);
app.use("/api/v1/customer-account/resend-verification", customerAccountLimiter);
app.use("/api/v1/customer-account/forgot-password", customerAccountLimiter);
app.use("/api/v1/customer-account/reset-password", customerAccountLimiter);
app.use("/api/v1/customer-account", customerAccountRouter);
app.use("/api/v1/products", productsRouter);
app.use("/api/v1/media", mediaRouter);
app.use("/api/v1/inventory", inventoryWorkflowRouter);
app.use("/api/v1/suppliers", suppliersRouter);
app.use("/api/v1/purchases", purchasesRouter);
app.use("/api/v1/customers", customersRouter);
app.use("/api/v1/sales", salesRouter);
app.use("/api/v1/installments", installmentsRouter);
app.use("/api/v1/creditors", creditorsRouter);
app.use("/api/v1/business", businessRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/branches", branchesRouter);
app.use("/api/v1/store/orders", checkoutLimiter);
app.use("/api/v1/store/orders/track", orderTrackingLimiter);
app.use("/api/v1/store", storeRouter);
app.use("/api/v1/online-orders", onlineOrdersRouter);
app.use("/api/v1/payments", paymentsRouter);
app.use("/api/v1/expenses", expensesRouter);
app.use("/api/v1/accounting", accountingRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/audit-logs", auditRouter);
app.use("/api/v1/reports", reportsRouter);
app.use((_request, _response, next) => next(new ApiError(404, "Route not found.", "NOT_FOUND")));

const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const requestId = String(response.locals.requestId ?? "unknown");
  if (response.headersSent) {
    _next(error);
    return;
  }
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      console.error("Upstream or application operation failed.", {
        requestId,
        method: request.method,
        route: request.route?.path,
        errorCode: error.code,
        status: error.status,
      });
    }
    const details = Array.isArray(error.details)
      ? error.details.map((issue) => {
          const entry = issue as { path?: unknown; message?: unknown };
          return {
            path: Array.isArray(entry.path) ? entry.path.filter((part) => typeof part === "string" || typeof part === "number") : [],
            ...(typeof entry.message === "string" ? { message: entry.message } : {}),
          };
        })
      : error.details && typeof error.details === "object"
        ? Object.fromEntries(Object.entries(error.details).filter(([key, value]) =>
            ["current", "requested", "productId", "sku", "name", "barcode", "available", "remainingCredit", "paymentReference", "status"].includes(key) &&
            (typeof value === "string" || typeof value === "number" || typeof value === "boolean"),
          ))
        : undefined;
    response.status(error.status).json({ error: { code: error.code, message: error.message, requestId, ...(Array.isArray(details) ? details.length ? { details } : {} : details && Object.keys(details).length ? { details } : {}) } });
    return;
  }
  if (error instanceof ZodError) {
    const details = error.issues.map(({ path, message }) => ({ path, message }));
    response.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Request validation failed.", requestId, details } });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({ error: { code: "IDENTIFIER_CONFLICT", message: "A record with these details already exists.", requestId } });
      return;
    }
    if (error.code === "P2003" || error.code === "P2014" || error.code === "P2034") {
      response.status(409).json({ error: { code: "RECORD_CONFLICT", message: "This change conflicts with current records. Reload the page and try again.", requestId } });
      return;
    }
    if (error.code === "P2025") {
      response.status(404).json({ error: { code: "NOT_FOUND", message: "The requested record was not found.", requestId } });
      return;
    }
    if (error.code === "P2021" || error.code === "P2022") {
      console.error("Database schema is behind the application version.", { requestId, method: request.method, route: request.route?.path, ...safeErrorMetadata(error) });
      response.status(503).json({ error: { code: "DATABASE_SCHEMA_OUTDATED", message: "The database needs its latest schema migration.", requestId } });
      return;
    }
    if (["P1000", "P1001", "P1002", "P1008", "P1017", "P2024", "P2037"].includes(error.code)) {
      console.error("Database service is unavailable.", { requestId, method: request.method, route: request.route?.path, ...safeErrorMetadata(error) });
      response.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is temporarily unavailable. Please try again shortly.", requestId } });
      return;
    }
    if (error.code === "P2028") {
      console.error("Database transaction did not complete.", { requestId, method: request.method, route: request.route?.path, ...safeErrorMetadata(error) });
      response.status(503).json({ error: { code: "DATABASE_TRANSACTION_RETRY", message: "The database could not finish this operation. Please try again.", requestId } });
      return;
    }
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    console.error("Database client could not connect.", { requestId, method: request.method, route: request.route?.path, ...safeErrorMetadata(error) });
    response.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "The database is temporarily unavailable. Please try again shortly.", requestId } });
    return;
  }
  const bodyError = error as { type?: unknown; status?: unknown; statusCode?: unknown } | null;
  if (bodyError?.type === "entity.parse.failed") {
    response.status(400).json({ error: { code: "INVALID_JSON", message: "Request body must contain valid JSON.", requestId } });
    return;
  }
  if (bodyError?.type === "entity.too.large") {
    response.status(413).json({ error: { code: "REQUEST_TOO_LARGE", message: "Request body is larger than the allowed limit.", requestId } });
    return;
  }
  if (error && typeof error === "object" && (error as { type?: unknown }).type === "error" && (error as { constructor?: { name?: string } }).constructor?.name === "ErrorEvent") {
    console.error("A connected service raised a network error event.", { requestId, method: request.method, route: request.route?.path, ...safeErrorMetadata(error) });
    response.status(503).json({ error: { code: "DEPENDENCY_UNAVAILABLE", message: "A connected service is temporarily unavailable. Please try again shortly.", requestId } });
    return;
  }
  console.error("Unhandled API error.", { requestId, method: request.method, route: request.route?.path, ...safeErrorMetadata(error) });
  response.status(500).json({ error: { code: "INTERNAL_ERROR", message: "An unexpected server error occurred.", requestId } });
};

app.use(errorHandler);
