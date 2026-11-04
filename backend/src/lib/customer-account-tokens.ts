import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type CustomerTokenPurpose = "EMAIL_VERIFY" | "PASSWORD_RESET";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export async function queueCustomerAccountToken(input: {
  accountId: string; businessId: string; email: string; name: string; storeSlug: string;
  purpose: CustomerTokenPurpose;
}, existingTransaction?: Prisma.TransactionClient) {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + (input.purpose === "EMAIL_VERIFY" ? 24 : 1) * 60 * 60 * 1000);
  const configuredBaseUrl = process.env.CUSTOMER_ACCOUNT_BASE_URL || (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!configuredBaseUrl) throw new Error("CUSTOMER_ACCOUNT_BASE_URL must be configured before customer account emails can be queued.");
  let baseUrl: URL;
  try { baseUrl = new URL(configuredBaseUrl); }
  catch { throw new Error("CUSTOMER_ACCOUNT_BASE_URL must be a valid absolute URL."); }
  if (!/^(https?:)$/.test(baseUrl.protocol) || (process.env.NODE_ENV === "production" && baseUrl.protocol !== "https:")) throw new Error("CUSTOMER_ACCOUNT_BASE_URL must use HTTPS in production.");
  if (baseUrl.username || baseUrl.password) throw new Error("CUSTOMER_ACCOUNT_BASE_URL must not include credentials.");
  const path = input.purpose === "EMAIL_VERIFY" ? "/account/verify-email" : "/account/reset-password";
  const link = new URL(path, baseUrl);
  link.searchParams.set("store", input.storeSlug);
  link.searchParams.set("token", rawToken);
  const isVerification = input.purpose === "EMAIL_VERIFY";
  const subject = isVerification ? "Verify your customer account" : "Reset your customer account password";
  const action = isVerification ? "verify your email address" : "choose a new password";
  const text = `Hello ${input.name},\n\nUse this link to ${action}: ${link.toString()}\n\nThis link expires in ${isVerification ? "24 hours" : "1 hour"}. If you did not request this, you can ignore this email.`;
  const html = `<p>Hello ${escapeHtml(input.name)},</p><p><a href="${escapeHtml(link.toString())}">Continue to ${action}</a></p><p>This link expires in ${isVerification ? "24 hours" : "1 hour"}. If you did not request this, you can ignore this email.</p>`;

  const persist = async (transaction: Prisma.TransactionClient) => {
    await transaction.customerAccountToken.updateMany({ where: { customerAccountId: input.accountId, purpose: input.purpose, consumedAt: null }, data: { consumedAt: new Date() } });
    await transaction.customerAccountToken.create({ data: { customerAccountId: input.accountId, tokenHash, purpose: input.purpose, expiresAt } });
    await transaction.emailOutbox.create({ data: { businessId: input.businessId, kind: input.purpose, destination: input.email, subject, text, html } });
  };
  if (existingTransaction) await persist(existingTransaction);
  else await prisma.$transaction(persist);
}

export function hashCustomerAccountToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
