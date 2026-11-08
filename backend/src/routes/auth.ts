import { createHash, randomBytes } from "node:crypto";
import argon2 from "argon2";
import { Router, type Request, type Response, type NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/errors.js";
import {
  getCookie,
  getRefreshCookieName,
  getSessionCookieName,
  getWorkspaceRole,
  requireAuth,
  type AuthContext,
} from "../middleware/auth.js";

export const authRouter = Router();
authRouter.use((_request, response, next) => {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Pragma", "no-cache");
  next();
});
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
const minutes = 60 * 1000;
const days = 24 * 60 * minutes;
const accessTtlMs = () => Number(process.env.ACCESS_TOKEN_TTL_MINUTES || 15) * minutes;
const refreshTtlMs = () => Number(process.env.REFRESH_TOKEN_TTL_DAYS || 7) * days;
const rotationGraceMs = () => Math.min(30, Math.max(5, Number(process.env.REFRESH_ROTATION_GRACE_SECONDS || 15))) * 1000;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const cookieSecurity = {
  httpOnly: true,
  secure: true,
  sameSite: process.env.COOKIE_SAME_SITE === "none" ? "none" as const : "lax" as const,
};

function requireFrontendOrigin(request: Request, _response: Response, next: NextFunction) {
  const origin = request.get("origin");
  const expectedOrigin = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
  if (origin !== expectedOrigin) {
    next(new ApiError(403, "This request did not come from the signed-in application.", "INVALID_ORIGIN"));
    return;
  }
  next();
}

function respondRefreshConflict(response: Response) {
  response.setHeader("Retry-After", "1");
  response.status(409).json({ error: { code: "SESSION_REFRESH_IN_PROGRESS", message: "Another tab is renewing this sign-in. Retrying shortly." } });
}

function setSessionCookies(response: Response, role: "OWNER" | "STAFF", accessToken: string, refreshToken: string, accessExpiresAt: Date, refreshExpiresAt: Date) {
  const sessionCookie = getSessionCookieName(role);
  const refreshCookie = getRefreshCookieName(role);
  // Clear the single-cookie names used before role-specific tab sessions.
  response.clearCookie(process.env.SESSION_COOKIE_NAME || "oceanic_session", { ...cookieSecurity, path: "/" });
  response.clearCookie(process.env.REFRESH_COOKIE_NAME || "oceanic_refresh", { ...cookieSecurity, path: "/api/v1/auth/refresh" });
  response.clearCookie(process.env.REFRESH_COOKIE_NAME || "oceanic_refresh", { ...cookieSecurity, path: "/api/v1/auth" });
  // Remove the wider refresh-cookie scope used by the earlier implementation.
  response.clearCookie(refreshCookie, { ...cookieSecurity, path: "/api/v1/auth" });
  response.cookie(sessionCookie, accessToken, {
    ...cookieSecurity,
    path: "/",
    expires: accessExpiresAt,
  });
  response.cookie(refreshCookie, refreshToken, {
    ...cookieSecurity,
    path: "/api/v1/auth/refresh",
    expires: refreshExpiresAt,
  });
}

function clearSessionCookies(response: Response, role: "OWNER" | "STAFF") {
  const sessionCookie = getSessionCookieName(role);
  const refreshCookie = getRefreshCookieName(role);
  response.clearCookie(sessionCookie, { ...cookieSecurity, path: "/" });
  response.clearCookie(refreshCookie, { ...cookieSecurity, path: "/api/v1/auth/refresh" });
  response.clearCookie(refreshCookie, { ...cookieSecurity, path: "/api/v1/auth" });
}

authRouter.post("/login", requireFrontendOrigin, async (request, response) => {
  const workspaceRole = getWorkspaceRole(request);
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a valid email and password.", "VALIDATION_ERROR", parsed.error.issues);

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findFirst({
    where: { email },
    select: { id: true, businessId: true, branchId: true, name: true, email: true, passwordHash: true, role: true, staffAccessRole: true, mustChangePassword: true, isActive: true },
  });
  if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, parsed.data.password))) {
    throw new ApiError(401, "Email or password is incorrect.", "INVALID_CREDENTIALS");
  }
  if (user.role !== workspaceRole) {
    throw new ApiError(403, "This account does not belong to this sign-in page.", "WORKSPACE_ROLE_MISMATCH");
  }
  if (user.role === "STAFF" && !user.branchId) throw new ApiError(409, "Ask the owner to assign your account to a branch before signing in.", "STAFF_BRANCH_REQUIRED");

  const accessToken = randomBytes(32).toString("base64url");
  const refreshToken = randomBytes(32).toString("base64url");
  const now = new Date();
  const accessExpiresAt = new Date(now.getTime() + accessTtlMs());
  const refreshExpiresAt = new Date(now.getTime() + refreshTtlMs());

  await prisma.$transaction(async (transaction) => {
    const session = await transaction.session.create({
      data: { userId: user.id, tokenHash: hashToken(accessToken), expiresAt: accessExpiresAt },
      select: { id: true },
    });
    await transaction.refreshToken.create({
      data: { sessionId: session.id, tokenHash: hashToken(refreshToken), expiresAt: refreshExpiresAt },
    });
  });

  setSessionCookies(response, user.role, accessToken, refreshToken, accessExpiresAt, refreshExpiresAt);
  response.json({
    user: { id: user.id, businessId: user.businessId, branchId: user.branchId, name: user.name, email: user.email, role: user.role, staffAccessRole: user.staffAccessRole, mustChangePassword: user.mustChangePassword },
    accessExpiresAt,
  });
});

authRouter.post("/refresh", requireFrontendOrigin, async (request, response) => {
  const workspaceRole = getWorkspaceRole(request);
  const rawRefreshToken = getCookie(request, getRefreshCookieName(workspaceRole)) ??
    getCookie(request, process.env.REFRESH_COOKIE_NAME || "oceanic_refresh");
  if (!rawRefreshToken) {
    clearSessionCookies(response, workspaceRole);
    throw new ApiError(401, "Your sign-in has expired. Sign in again.", "SESSION_EXPIRED");
  }

  const existingToken = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(rawRefreshToken) },
    include: { session: { include: { user: { select: { id: true, isActive: true, role: true } } } } },
  });
  const now = new Date();
  if (!existingToken) {
    clearSessionCookies(response, workspaceRole);
    throw new ApiError(401, "Your sign-in has expired. Sign in again.", "SESSION_EXPIRED");
  }

  if (existingToken.session.user.role !== workspaceRole) {
    clearSessionCookies(response, workspaceRole);
    throw new ApiError(401, "Sign in to this workspace to continue.", "WORKSPACE_ROLE_MISMATCH");
  }

  if (existingToken.revokedAt || existingToken.session.revokedAt) {
    clearSessionCookies(response, workspaceRole);
    throw new ApiError(401, "Your sign-in has expired. Sign in again.", "SESSION_EXPIRED");
  }

  if (existingToken.usedAt) {
    if (now.getTime() - existingToken.usedAt.getTime() <= rotationGraceMs()) {
      respondRefreshConflict(response);
      return;
    }
    await prisma.$transaction([
      prisma.session.updateMany({ where: { id: existingToken.sessionId, revokedAt: null }, data: { revokedAt: now } }),
      prisma.refreshToken.updateMany({ where: { sessionId: existingToken.sessionId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    clearSessionCookies(response, workspaceRole);
    throw new ApiError(401, "This sign-in could not be renewed. Sign in again.", "SESSION_REUSE_DETECTED");
  }

  if (existingToken.expiresAt <= now || !existingToken.session.user.isActive) {
    await prisma.$transaction([
      prisma.session.updateMany({ where: { id: existingToken.sessionId, revokedAt: null }, data: { revokedAt: now } }),
      prisma.refreshToken.updateMany({ where: { sessionId: existingToken.sessionId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    clearSessionCookies(response, workspaceRole);
    throw new ApiError(401, "Your sign-in has expired. Sign in again.", "SESSION_EXPIRED");
  }

  const nextAccessToken = randomBytes(32).toString("base64url");
  const nextRefreshToken = randomBytes(32).toString("base64url");
  const accessExpiresAt = new Date(now.getTime() + accessTtlMs());
  try {
    await prisma.$transaction(async (transaction) => {
      const claimed = await transaction.refreshToken.updateMany({
        where: { id: existingToken.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (!claimed.count) throw new ApiError(401, "This sign-in could not be renewed. Sign in again.", "SESSION_REUSE_DETECTED");

      const updatedSession = await transaction.session.updateMany({
        where: { id: existingToken.sessionId, revokedAt: null },
        data: { tokenHash: hashToken(nextAccessToken), expiresAt: accessExpiresAt },
      });
      if (!updatedSession.count) throw new ApiError(401, "Your sign-in has expired. Sign in again.", "SESSION_EXPIRED");

      await transaction.refreshToken.create({
        data: {
          sessionId: existingToken.sessionId,
          tokenHash: hashToken(nextRefreshToken),
          expiresAt: existingToken.expiresAt,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof ApiError && error.code === "SESSION_REUSE_DETECTED") {
      const latestToken = await prisma.refreshToken.findUnique({ where: { id: existingToken.id }, select: { usedAt: true } });
      if (latestToken?.usedAt && Date.now() - latestToken.usedAt.getTime() <= rotationGraceMs()) {
        respondRefreshConflict(response);
        return;
      }
      await prisma.$transaction([
        prisma.session.updateMany({ where: { id: existingToken.sessionId, revokedAt: null }, data: { revokedAt: new Date() } }),
        prisma.refreshToken.updateMany({ where: { sessionId: existingToken.sessionId, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      clearSessionCookies(response, workspaceRole);
      throw error;
    }
    if (error instanceof ApiError) throw error;
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      respondRefreshConflict(response);
      return;
    }
    throw error;
  }

  setSessionCookies(response, workspaceRole, nextAccessToken, nextRefreshToken, accessExpiresAt, existingToken.expiresAt);
  response.json({ accessExpiresAt });
});

authRouter.get("/me", requireAuth, (_request, response) => {
  const auth = response.locals.auth as AuthContext;
  response.json({
    user: { id: auth.userId, businessId: auth.businessId, branchId: auth.branchId, name: auth.name, email: auth.email, role: auth.role, staffAccessRole: auth.staffAccessRole, mustChangePassword: auth.mustChangePassword },
    accessExpiresAt: auth.accessExpiresAt,
  });
});

authRouter.post("/refresh/logout", requireFrontendOrigin, async (request, response) => {
  const workspaceRole = getWorkspaceRole(request);
  const accessToken = getCookie(request, getSessionCookieName(workspaceRole)) ??
    getCookie(request, process.env.SESSION_COOKIE_NAME || "oceanic_session");
  const refreshToken = getCookie(request, getRefreshCookieName(workspaceRole)) ??
    getCookie(request, process.env.REFRESH_COOKIE_NAME || "oceanic_refresh");
  const sessionIds = new Set<string>();

  if (accessToken) {
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(accessToken) }, select: { id: true } });
    if (session) sessionIds.add(session.id);
  }
  if (refreshToken) {
    const session = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) }, select: { sessionId: true } });
    if (session) sessionIds.add(session.sessionId);
  }

  const revokedAt = new Date();
  if (sessionIds.size) {
    await prisma.$transaction([
      prisma.session.updateMany({ where: { id: { in: [...sessionIds] }, revokedAt: null }, data: { revokedAt } }),
      prisma.refreshToken.updateMany({ where: { sessionId: { in: [...sessionIds] }, revokedAt: null }, data: { revokedAt } }),
    ]);
  }

  clearSessionCookies(response, workspaceRole);
  response.status(204).end();
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12).max(200),
});

authRouter.post("/change-password", requireFrontendOrigin, requireAuth, async (request, response) => {
  const parsed = changePasswordSchema.safeParse(request.body);
  if (!parsed.success) {
    throw new ApiError(400, "Enter your current password and choose a new password with at least 12 characters.", "VALIDATION_ERROR", parsed.error.issues);
  }

  const auth = response.locals.auth as AuthContext;
  const user = await prisma.user.findUnique({ where: { id: auth.userId }, select: { id: true, passwordHash: true } });
  if (!user || !(await argon2.verify(user.passwordHash, parsed.data.currentPassword))) {
    throw new ApiError(401, "Your current password is incorrect.", "INVALID_CURRENT_PASSWORD");
  }

  const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id });
  const revokedAt = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({ where: { id: user.id }, data: { passwordHash, mustChangePassword: false } });
    await transaction.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt } });
    await transaction.refreshToken.updateMany({ where: { session: { userId: user.id }, revokedAt: null }, data: { revokedAt } });
  });

  clearSessionCookies(response, auth.role);
  response.status(204).end();
});
