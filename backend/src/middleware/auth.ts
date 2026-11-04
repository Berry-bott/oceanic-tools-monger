import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/errors.js";

export type AuthContext = {
  sessionId: string;
  userId: string;
  businessId: string;
  branchId: string | null;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
  accessExpiresAt: Date;
};

export type WorkspaceRole = AuthContext["role"];

const workspaceHeader = "x-oceanic-workspace";

export function getWorkspaceRole(request: Request): WorkspaceRole {
  const value = request.get(workspaceHeader)?.toUpperCase();
  if (value === "OWNER" || value === "STAFF") return value;
  // Keep existing owner clients working during rollout. Staff pages must send
  // their workspace explicitly; authorization still checks the stored role.
  return "OWNER";
}

export function getSessionCookieName(role: WorkspaceRole = "OWNER") {
  const base = process.env.SESSION_COOKIE_NAME || "oceanic_session";
  return `${base}_${role.toLowerCase()}`;
}

export function getRefreshCookieName(role: WorkspaceRole = "OWNER") {
  const base = process.env.REFRESH_COOKIE_NAME || "oceanic_refresh";
  return `${base}_${role.toLowerCase()}`;
}

export function getCookie(request: Request, cookieName: string) {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== cookieName) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      // Ignore malformed cookie encoding and treat the credential as absent.
      return undefined;
    }
  }
  return undefined;
}

export const requireAuth = async (_request: Request, response: Response, next: NextFunction) => {
  try {
    const workspaceRole = getWorkspaceRole(_request);
    const token = getCookie(_request, getSessionCookieName(workspaceRole)) ??
      getCookie(_request, process.env.SESSION_COOKIE_NAME || "oceanic_session");
    if (!token) throw new ApiError(401, "Sign in to continue.", "UNAUTHENTICATED");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, businessId: true, branchId: true, name: true, email: true, role: true, isActive: true } } },
    });
    if (!session || session.revokedAt || session.expiresAt <= new Date() || !session.user.isActive) {
      throw new ApiError(401, "Your session has expired. Sign in again.", "SESSION_EXPIRED");
    }
    if (session.user.role !== workspaceRole) {
      throw new ApiError(401, "Sign in to this workspace to continue.", "WORKSPACE_ROLE_MISMATCH");
    }
    response.locals.auth = {
      sessionId: session.id,
      userId: session.user.id,
      businessId: session.user.businessId,
      branchId: session.user.branchId,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role,
      accessExpiresAt: session.expiresAt,
    } satisfies AuthContext;
    next();
  } catch (error) {
    next(error);
  }
};

export function requireRoles(...roles: AuthContext["role"][]) {
  return (_request: Request, response: Response, next: NextFunction) => {
    const auth = response.locals.auth as AuthContext | undefined;
    if (!auth) return next(new ApiError(401, "Sign in to continue.", "UNAUTHENTICATED"));
    if (!roles.includes(auth.role)) return next(new ApiError(403, "You do not have permission to perform this action.", "FORBIDDEN"));
    next();
  };
}
