import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { ApiError } from "../lib/errors.js";

export const CUSTOMER_SESSION_COOKIE = "oceanic_customer_session";

export type CustomerAuthContext = {
  sessionId: string;
  accountId: string;
  businessId: string;
  customerId: string;
  email: string;
};

export const requireCustomerAuth = async (request: Request, response: Response, next: NextFunction) => {
  try {
    const cookie = request.headers.cookie?.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${CUSTOMER_SESSION_COOKIE}=`));
    let token: string | undefined;
    try {
      token = cookie ? decodeURIComponent(cookie.slice(CUSTOMER_SESSION_COOKIE.length + 1)) : undefined;
    } catch {
      throw new ApiError(401, "Your customer sign-in is invalid. Sign in again.", "CUSTOMER_UNAUTHENTICATED");
    }
    if (!token) throw new ApiError(401, "Sign in to view your customer account.", "CUSTOMER_UNAUTHENTICATED");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const session = await prisma.customerSession.findUnique({ where: { tokenHash }, include: { customerAccount: { include: { customer: { select: { isActive: true } } } } } });
    if (!session || session.expiresAt <= new Date() || !session.customerAccount.customer.isActive) {
      if (session) await prisma.customerSession.delete({ where: { id: session.id } });
      throw new ApiError(401, "Your customer session has expired. Sign in again.", "CUSTOMER_SESSION_EXPIRED");
    }
    response.locals.customerAuth = {
      sessionId: session.id,
      accountId: session.customerAccount.id,
      businessId: session.customerAccount.businessId,
      customerId: session.customerAccount.customerId,
      email: session.customerAccount.email,
    } satisfies CustomerAuthContext;
    next();
  } catch (error) { next(error); }
};
