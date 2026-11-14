import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import {
  getStorefrontProductMetadata,
  getStorefrontTrendingProductIds,
} from "../lib/storefront-product-metadata.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry, type LedgerLine } from "../lib/accounting.js";
import { consumeReservedLots, releaseReservedLots, reserveFefoLots } from "../lib/stock-lots.js";
import { requireAuth, requireRoles, requireStaffAccess, type AuthContext } from "../middleware/auth.js";
import { requireCustomerAuth, type CustomerAuthContext } from "../middleware/customer-auth.js";
import { sendEmail } from "../lib/mailer.js";

export const storeRouter = Router();
export const paystackWebhookRouter = Router();
export const onlineOrdersRouter = Router();
const checkoutSchema = z.object({
  branchId: z.string().optional(),
  customerId: z.string().optional(),
  customerName: z.string().trim().min(1).max(180),
  email: z.email(),
  phone: z.string().trim().max(40).optional(),
  fulfillmentMethod: z.enum(["DELIVERY", "COLLECTION"]),
  paymentOption: z.enum(["PAYSTACK", "PAY_ON_PICKUP"]).default("PAYSTACK"),
  deliveryAddress: z.string().trim().max(1000).optional(),
  lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive() })).min(1).max(50),
});
const orderReference = () => `WEB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
const minorUnits = (amount: number) => Math.round(amount * 100);
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
})[character]!);

function orderEmailContent(input: {
  orderNumber: string;
  customerName: string;
  businessName: string;
  fulfillmentMethod: string;
  deliveryAddress?: string | null;
  branchName: string;
  branchAddress?: string | null;
  total: number;
  currency: string;
  paymentMessage: string;
  lines: Array<{ productName: string; sku: string; quantity: number | string; unitPrice: number | string; lineTotal: number | string }>;
}) {
  const baseUrl = (process.env.CUSTOMER_ACCOUNT_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const trackUrl = `${baseUrl}/track-order?order=${encodeURIComponent(input.orderNumber)}`;
  const accountUrl = `${baseUrl}/account`;
  const logoUrl = `${baseUrl}/oceantoolslogo.png`;
  const money = (amount: number | string) =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency: input.currency, maximumFractionDigits: 2 }).format(Number(amount));
  const branchAddress = input.branchAddress?.trim();
  const sameAddress = branchAddress && input.branchName.trim().normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "") === branchAddress.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
  const fulfillmentDetails = input.fulfillmentMethod === "COLLECTION"
    ? `Pickup at ${input.branchName.trim()}${branchAddress && !sameAddress ? `, ${branchAddress}` : ""}`
    : `Home Delivery to: ${input.deliveryAddress || "the address supplied at checkout"}`;
  const lineText = input.lines.map((line) =>
    `• ${line.productName} (${line.sku}) × ${Number(line.quantity).toLocaleString()} — ${money(line.lineTotal)}`,
  ).join("\n");
  const lineHtml = input.lines.map((line) =>
    `<tr>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;font-weight:600;color:#1e293b">
        ${escapeHtml(line.productName)}
        <div style="font-size:12px;color:#64748b;font-weight:normal;margin-top:2px">SKU: ${escapeHtml(line.sku)}</div>
      </td>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:center;color:#475569">${Number(line.quantity).toLocaleString()}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:right;color:#475569">${money(line.unitPrice)}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:600;color:#0f172a">${money(line.lineTotal)}</td>
    </tr>`,
  ).join("");

  return {
    subject: `Order Confirmation: ${input.orderNumber} — ${input.businessName}`,
    text: [
      `Hello ${input.customerName},`,
      "",
      `Thank you for shopping with ${input.businessName}!`,
      `Your order ${input.orderNumber} has been received.`,
      "",
      input.paymentMessage,
      "",
      `Fulfillment: ${fulfillmentDetails}`,
      "",
      "Items Ordered:",
      lineText,
      "",
      `Total: ${money(input.total)}`,
      "",
      `Track your order online: ${trackUrl}`,
      `View your full order history in your account: ${accountUrl}`,
      "",
      `Need help? Reply directly to this email or contact support at support@oceanictoolsmonger.com.`,
      "",
      `Best regards,`,
      input.businessName,
    ].join("\n"),
    html: `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"><title>Order Confirmation</title></head>
    <body style="margin:0;padding:24px;background-color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;line-height:1.6">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
        <!-- Brand Header -->
        <div style="background-color:#ffffff;padding:26px 32px;text-align:left;border-bottom:3px solid #ea580c">
          <div style="display:block;margin:0 0 14px">
            <img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(input.businessName)}" width="120" style="display:block;width:120px;height:auto;max-height:48px;object-fit:contain" />
          </div>
          <h1 style="margin:0;color:#17212b;font-size:22px;letter-spacing:-0.02em;font-weight:800">
            ${escapeHtml(input.businessName)}
          </h1>
          <p style="margin:4px 0 0;color:#64748b;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase">
            Authentic Industrial & Construction Tools
          </p>
        </div>

        <!-- Order Hero Banner -->
        <div style="padding:30px 32px 24px;background:#ffffff">
          <div style="display:inline-block;padding:4px 11px;background:#ffffff;color:#c2410c;border:1px solid #fed7aa;font-size:11px;font-weight:700;border-radius:9999px;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.04em">
            Order Confirmed
          </div>
          <h2 style="margin:0 0 8px;font-size:22px;color:#0f172a;font-weight:700">Thank you for your order, ${escapeHtml(input.customerName)}!</h2>
          <p style="margin:0 0 16px;color:#475569;font-size:14px">
            We have received your order <strong>${escapeHtml(input.orderNumber)}</strong>. ${escapeHtml(input.paymentMessage)}
          </p>

          <!-- Order Summary Card -->
          <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:20px 0">
            <table style="width:100%;border-collapse:collapse;font-size:13px">
              <tr>
                <td style="color:#64748b;padding:4px 0">Order Reference:</td>
                <td style="font-weight:700;color:#0f172a;text-align:right">${escapeHtml(input.orderNumber)}</td>
              </tr>
              <tr>
                <td style="color:#64748b;padding:4px 0">Fulfillment Method:</td>
                <td style="font-weight:600;color:#0f172a;text-align:right">${escapeHtml(input.fulfillmentMethod === "COLLECTION" ? "Store Pickup" : "Direct Delivery")}</td>
              </tr>
              <tr>
                <td style="color:#64748b;padding:4px 0">Destination:</td>
                <td style="font-weight:600;color:#0f172a;text-align:right">${escapeHtml(fulfillmentDetails)}</td>
              </tr>
            </table>
          </div>

          <!-- Items Table -->
          <h3 style="margin:24px 0 12px;font-size:16px;color:#0f172a;font-weight:700">Purchased Items</h3>
          <table style="width:100%;border-collapse:collapse;font-size:14px;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;background:#ffffff">
            <thead>
              <tr style="background:#ffffff;color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em">
                <th style="padding:10px 14px;text-align:left">Item</th>
                <th style="padding:10px 14px;text-align:center">Qty</th>
                <th style="padding:10px 14px;text-align:right">Price</th>
                <th style="padding:10px 14px;text-align:right">Total</th>
              </tr>
            </thead>
            <tbody>
              ${lineHtml}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="3" style="padding:16px 14px;text-align:right;font-weight:700;font-size:15px;color:#0f172a;border-top:2px solid #e2e8f0">Total Amount:</td>
                <td style="padding:16px 14px;text-align:right;font-weight:800;font-size:18px;color:#ea580c;border-top:2px solid #e2e8f0">${money(input.total)}</td>
              </tr>
            </tfoot>
          </table>

          <!-- Actions -->
          <div style="text-align:center;margin:32px 0 16px">
            <a href="${escapeHtml(trackUrl)}" style="display:inline-block;padding:12px 28px;background-color:#ea580c;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:9999px;box-shadow:0 2px 8px rgba(234,88,12,0.3)">
              Track Your Order & Delivery
            </a>
            <div style="margin-top:12px">
              <a href="${escapeHtml(accountUrl)}" style="font-size:13px;color:#ea580c;text-decoration:underline">
                View your purchases in your customer account
              </a>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div style="background-color:#ffffff;padding:18px 32px;text-align:center;border-top:1px solid #e5e7eb;font-size:12px;color:#64748b">
          <p style="margin:0 0 4px">Questions about your order? Reach our support team at <a href="mailto:support@oceanictoolsmonger.com" style="color:#ea580c">support@oceanictoolsmonger.com</a></p>
          <p style="margin:0">© ${new Date().getFullYear()} ${escapeHtml(input.businessName)}. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
    `,
  };
}

function orderEmailOutboxData(input: {
  businessId: string;
  email: string;
  content: ReturnType<typeof orderEmailContent>;
}) {
  return {
    businessId: input.businessId,
    kind: "ONLINE_ORDER_CONFIRMATION",
    destination: input.email,
    ...input.content,
  };
}

async function getPublicOnlineOrderDetails(orderId: string) {
  const order = await prisma.onlineOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      number: true,
      status: true,
      fulfillmentMethod: true,
      deliveryAddress: true,
      subtotal: true,
      discount: true,
      tax: true,
      deliveryFee: true,
      total: true,
      createdAt: true,
      updatedAt: true,
      branch: { select: { name: true, address: true } },
      lines: { select: { id: true, productName: true, sku: true, quantity: true, unitPrice: true, lineTotal: true } },
      payments: { select: { method: true, status: true, amount: true, reference: true, paidAt: true } },
      business: { select: { currency: true } },
    },
  });
  const { business, ...details } = order;
  return { ...details, currency: business.currency };
}

function trackedOrderData(order: Awaited<ReturnType<typeof getPublicOnlineOrderDetails>>) {
  return {
    ...order,
    branch: order.branch,
    lines: order.lines.map((line) => ({
      ...line,
      quantity: line.quantity.toString(),
      unitPrice: line.unitPrice.toString(),
      lineTotal: line.lineTotal.toString(),
    })),
    subtotal: order.subtotal.toString(),
    discount: order.discount.toString(),
    tax: order.tax.toString(),
    deliveryFee: order.deliveryFee.toString(),
    total: order.total.toString(),
    payments: order.payments.map((payment) => ({
      ...payment,
      amount: payment.amount.toString(),
    })),
  };
}

onlineOrdersRouter.use(requireAuth, requireStaffAccess("SENIOR_STAFF"));
onlineOrdersRouter.get("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const branchId = typeof request.query.branchId === "string" ? request.query.branchId : undefined;
  if (auth.role === "STAFF" && (!auth.branchId || (branchId && branchId !== auth.branchId))) throw new ApiError(403, "You can only view orders for your assigned branch.", "BRANCH_ACCESS_DENIED");
  const scopedBranchId = auth.role === "STAFF" ? auth.branchId : branchId;
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const where = { businessId: auth.businessId, ...(scopedBranchId ? { branchId: scopedBranchId } : {}), ...(status && Object.values(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "DELIVERED", "COLLECTED", "PARTIALLY_FULFILLED", "CANCELLED", "RETURN_REQUESTED"]).includes(status) ? { status: status as never } : {}) };
  const [data, statusCounts] = await Promise.all([
    prisma.onlineOrder.findMany({
      where,
      include: {
        branch: { select: { id: true, name: true, address: true } },
        lines: { select: { id: true, productName: true, sku: true, quantity: true, unitPrice: true, lineTotal: true } },
        payments: { select: { method: true, status: true, amount: true, reference: true, provider: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.onlineOrder.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  response.json({ data, counts: Object.fromEntries(statusCounts.map((entry) => [entry.status, entry._count._all])) });
});

onlineOrdersRouter.post("/:orderId/receive-pickup-payment", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({
    method: z.enum(["CASH", "BANK_TRANSFER", "CARD"]),
    reference: z.string().trim().max(80).optional(),
  }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose how the pickup payment was received.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const order = await prisma.onlineOrder.findFirst({
    where: {
      id: request.params.orderId as string,
      businessId: auth.businessId,
      ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}),
    },
    include: { payments: true },
  });
  if (!order) throw new ApiError(404, "Online order not found.", "ORDER_NOT_FOUND");
  if (order.fulfillmentMethod !== "COLLECTION" || order.status !== "PENDING_PAYMENT") {
    throw new ApiError(409, "This order is not awaiting pickup payment.", "PICKUP_PAYMENT_NOT_DUE");
  }
  const payment = order.payments.find(
    (entry) => entry.status === "PENDING" && entry.provider === null && entry.method === "CASH",
  );
  if (!payment) throw new ApiError(409, "This order is not configured for pay on pickup.", "PAY_ON_PICKUP_NOT_ENABLED");
  await completeOnlineOrderPayment(payment.id, {
    paidAt: new Date(),
    method: parsed.data.method,
    reference: parsed.data.reference || undefined,
    ledgerAccountCode: parsed.data.method === "CASH" ? "1000" : "1010",
    ledgerDescription: `${parsed.data.method} pickup payment`,
    auditAction: "PICKUP_PAYMENT_RECEIVED",
    notificationTitle: "Pickup order payment received",
    notificationMessage: `Payment for pickup order ${order.number} was recorded.`,
    movementActorType: "USER",
    userId: auth.userId,
  });
  response.json({ data: { orderNumber: order.number, status: "PAID" } });
});

onlineOrdersRouter.post("/:orderId/transition", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ status: z.enum(["PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "DELIVERED", "COLLECTED", "CANCELLED", "RETURN_REQUESTED"]) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose a valid order status.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const order = await prisma.onlineOrder.findFirst({ where: { id: request.params.orderId as string, businessId: auth.businessId, ...(auth.role === "STAFF" ? { branchId: auth.branchId ?? "__unassigned__" } : {}) } });
  if (!order) throw new ApiError(404, "Online order not found.", "ORDER_NOT_FOUND");
  const transitions: Record<string, string[]> = { PENDING_PAYMENT: ["CANCELLED"], PAID: ["PROCESSING"], PROCESSING: ["READY_FOR_COLLECTION", "DISPATCHED"], READY_FOR_COLLECTION: ["COLLECTED"], DISPATCHED: ["DELIVERED"], DELIVERED: ["RETURN_REQUESTED"], COLLECTED: ["RETURN_REQUESTED"] };
  const nextStatus = parsed.data.status;
  if (!transitions[order.status]?.includes(nextStatus)) throw new ApiError(409, "This order status transition is not allowed.", "INVALID_ORDER_TRANSITION", { current: order.status, requested: nextStatus });
  if (nextStatus === "CANCELLED" && ["PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED"].includes(order.status)) throw new ApiError(409, "Paid orders require a return and refund workflow; they cannot be cancelled.", "PAID_ORDER_CANNOT_BE_CANCELLED");
  const updated = await prisma.$transaction(async (transaction) => {
    if (nextStatus === "CANCELLED") {
      const activeReservations = await transaction.stockReservation.findMany({ where: { onlineOrderId: order.id, status: "ACTIVE" } });
      for (const reservation of activeReservations) {
        const changed = await transaction.stockBalance.updateMany({ where: { productId: reservation.productId, branchId: reservation.branchId, reserved: { gte: reservation.quantity } }, data: { reserved: { decrement: reservation.quantity } } });
        if (!changed.count) throw new ApiError(409, "Could not safely release the order reservation.", "RESERVATION_CONFLICT");
        await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED" } });
      }
      await transaction.payment.updateMany({ where: { onlineOrderId: order.id, status: "PENDING" }, data: { status: "FAILED" } });
    }
    const result = await transaction.onlineOrder.update({ where: { id: order.id }, data: { status: nextStatus as never } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "ONLINE_ORDER_STATUS_CHANGED", entityType: "OnlineOrder", entityId: order.id, before: { status: order.status }, after: { status: nextStatus } });
    return result;
  });
  response.json({ data: updated });
});

async function paystackRequest<T>(path: string, init: RequestInit): Promise<T> {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) throw new ApiError(503, "Online payments are not configured.", "PAYMENT_PROVIDER_UNAVAILABLE");
  let response: globalThis.Response;
  try {
    response = await fetch(`https://api.paystack.co${path}`, { ...init, headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", ...init.headers }, signal: AbortSignal.timeout(15_000) });
  } catch (error) {
    const errorName = error instanceof Error ? error.name : "";
    const timedOut = errorName === "TimeoutError" || errorName === "AbortError";
    throw new ApiError(
      timedOut ? 504 : 502,
      timedOut ? "The payment provider took too long to respond. Please try again." : "The payment provider could not be reached. Please try again.",
      timedOut ? "PAYMENT_PROVIDER_TIMEOUT" : "PAYMENT_PROVIDER_UNAVAILABLE",
    );
  }
  const result = await response.json().catch(() => null) as { status?: boolean; message?: string; data?: T } | null;
  if (!response.ok || !result?.status || result.data === undefined) throw new ApiError(502, "The payment provider did not complete the request.", "PAYMENT_PROVIDER_ERROR", { status: response.status, providerMessage: result?.message });
  return result.data;
}

async function resolveStoreBusiness(storeSlug?: string) {
  if (storeSlug) {
    const business = await prisma.business.findUnique({
      where: { storeSlug },
      select: { id: true, name: true, storeSlug: true, currency: true }
    });
    if (business) return business;
  }
  const fallback = await prisma.business.findFirst({
    select: { id: true, name: true, storeSlug: true, currency: true }
  });
  if (!fallback) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  return fallback;
}

storeRouter.get("/info", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const branches = await prisma.branch.findMany({
    where: { businessId: business.id, isPickupLocation: true, address: { not: null } },
    select: { id: true, name: true, address: true, isDefault: true, isPickupLocation: true },
    orderBy: [{ address: "asc" }, { name: "asc" }]
  });
  response.set("Cache-Control", "public, max-age=60, stale-while-revalidate=60");
  const fulfillmentSettings = await prisma.business.findUniqueOrThrow({
    where: { id: business.id },
    select: { onlineDeliveryEnabled: true, onlineDeliveryFee: true, payOnPickupEnabled: true },
  });
  response.json({ data: { ...business, ...fulfillmentSettings, branches } });
});

storeRouter.post("/orders/track", async (request, response) => {
  const parsed = z.object({
    orderNumber: z.string().trim().min(8).max(40),
    email: z.email().transform((value) => value.trim().toLowerCase()),
  }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter the order number and checkout email.", "VALIDATION_ERROR", parsed.error.issues);
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const order = await prisma.onlineOrder.findFirst({
    where: {
      businessId: business.id,
      number: parsed.data.orderNumber,
      customerEmail: parsed.data.email,
    },
    select: { id: true },
  });
  if (!order) throw new ApiError(404, "We could not find an order matching those details.", "ORDER_NOT_FOUND");
  response.set("Cache-Control", "no-store");
  response.json({ data: trackedOrderData(await getPublicOnlineOrderDetails(order.id)) });
});

storeRouter.post("/orders/track-authenticated", requireCustomerAuth, async (request, response) => {
  const parsed = z.object({ orderNumber: z.string().trim().min(8).max(40) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Enter a valid order number.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.customerAuth as CustomerAuthContext;
  const order = await prisma.onlineOrder.findFirst({
    where: {
      businessId: auth.businessId,
      number: parsed.data.orderNumber,
      OR: [
        { customerId: auth.customerId },
        { customerEmail: { equals: auth.email, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
  if (!order) throw new ApiError(404, "We could not find an order matching your account and order number.", "ORDER_NOT_FOUND");
  response.set("Cache-Control", "no-store");
  response.json({ data: trackedOrderData(await getPublicOnlineOrderDetails(order.id)) });
});

storeRouter.get("/categories", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);

  const products = await prisma.product.findMany({
    where: { businessId: business.id, state: "ACTIVE", isPublished: true },
    select: {
      id: true,
      name: true,
      category: true,
      balances: {
        where: { branch: { businessId: business.id } },
        select: { onHand: true, reserved: true },
      },
      productImages: {
        where: { mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } },
        orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }],
        take: 1,
        select: { mediaAsset: { select: { secureUrl: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const categoryMap = new Map<string, { name: string; slug: string; count: number; image: string | null }>();

  for (const product of products) {
    if (product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) <= 0) continue;
    const rawCategory = product.category?.trim();
    if (!rawCategory) continue;

    const lower = rawCategory.toLowerCase();
    let displayName = rawCategory;
    if (lower === "power tools" || lower === "power tool") {
      displayName = "Power Tools";
    } else if (lower === "nail" || lower === "nails" || lower === "fasteners & nails") {
      displayName = "Fasteners & Nails";
    } else if (lower === "safety & boots" || lower === "safety" || lower === "boots") {
      displayName = "Safety & Boots";
    } else if (lower === "saw & cutting tools" || lower === "saw tools" || lower === "sawing") {
      displayName = "Saw & Cutting Tools";
    } else if (lower === "hand tools" || lower === "hand tool") {
      displayName = "Hand Tools";
    } else if (lower === "welding & equipment" || lower === "welding") {
      displayName = "Welding & Equipment";
    } else {
      displayName = rawCategory.replace(/\b\w/g, (char) => char.toUpperCase());
    }

    const key = displayName.toLowerCase();
    const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const imgUrl = product.productImages[0]?.mediaAsset?.secureUrl || null;

    const existing = categoryMap.get(key);
    if (existing) {
      existing.count += 1;
      if (!existing.image && imgUrl) {
        existing.image = imgUrl;
      }
    } else {
      categoryMap.set(key, {
        name: displayName,
        slug,
        count: 1,
        image: imgUrl,
      });
    }
  }

  const result = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count);
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.json({ data: result });
});

storeRouter.get("/collections", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const trendingProductIds = await getStorefrontTrendingProductIds(business.id);

  const productInclude = {
    balances: {
      where: { branch: { businessId: business.id } },
      select: { onHand: true, reserved: true },
    },
    productImages: {
      where: { mediaAsset: { status: "ACTIVE" as const, secureUrl: { not: null } } },
      orderBy: [{ isPrimary: "desc" as const }, { view: "asc" as const }, { position: "asc" as const }],
      include: { mediaAsset: { select: { id: true, secureUrl: true, originalFilename: true, mimeType: true } } },
    },
    specifications: { orderBy: { position: "asc" as const } },
  };
  const [trendingRows, newArrivalRows] = await Promise.all([
    trendingProductIds.length
      ? prisma.product.findMany({
          where: {
            businessId: business.id,
            id: { in: trendingProductIds },
            state: "ACTIVE",
            isPublished: true,
          },
          include: productInclude,
        })
      : Promise.resolve([]),
    prisma.product.findMany({
      where: { businessId: business.id, state: "ACTIVE", isPublished: true },
      include: productInclude,
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);

  const stockedTrendingRows = trendingRows.filter((product) => product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) > 0);
  const stockedNewArrivalRows = newArrivalRows
    .filter((product) => product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) > 0)
    .slice(0, 4);

  const metadata = await getStorefrontProductMetadata(
    business.id,
    [...new Set([...stockedTrendingRows, ...stockedNewArrivalRows].map((product) => product.id))],
    trendingProductIds,
  );
  const toStoreProduct = (product: (typeof newArrivalRows)[number]) => {
    const {
      costPrice: _costPrice,
      bottomPrice: _bottomPrice,
      createdById: _createdBy,
      normalizedName: _normalized,
      balances,
      productImages,
      ...fields
    } = product;
    return {
      ...fields,
      ...metadata.get(product.id),
      images: productImages.map(({ id, view, position, mediaAsset }) => ({
        id,
        view,
        position,
        imageUrl: mediaAsset.secureUrl,
        originalFilename: mediaAsset.originalFilename,
        mimeType: mediaAsset.mimeType,
      })),
      available: balances.reduce(
        (sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved),
        0,
      ),
    };
  };
  const trendingById = new Map(stockedTrendingRows.map((product) => [product.id, product]));
  const trending = trendingProductIds
    .map((productId) => trendingById.get(productId))
    .filter((product): product is NonNullable<typeof product> => Boolean(product))
    .map(toStoreProduct);

  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.json({ data: { trending, newArrivals: stockedNewArrivalRows.map(toStoreProduct) } });
});

storeRouter.get("/products", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const products = await prisma.product.findMany({ where: { businessId: business.id, state: "ACTIVE", isPublished: true, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { category: { contains: search, mode: "insensitive" } }] } : {}) }, include: { balances: { where: { branch: { businessId: business.id } }, select: { onHand: true, reserved: true } }, productImages: { where: { mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } }, orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }], include: { mediaAsset: { select: { id: true, secureUrl: true, originalFilename: true, mimeType: true } } } }, specifications: { orderBy: { position: "asc" } } }, orderBy: { name: "asc" } });
  const stockedProducts = products.filter((product) => product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) > 0);
  const metadata = await getStorefrontProductMetadata(business.id, stockedProducts.map((product) => product.id));
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.json({ data: stockedProducts.map(({ costPrice: _costPrice, bottomPrice: _bottomPrice, createdById: _createdBy, normalizedName: _normalized, balances, ...product }) => ({ ...product, ...metadata.get(product.id), images: product.productImages.map(({ id, view, position, mediaAsset }) => ({ id, view, position, imageUrl: mediaAsset.secureUrl, originalFilename: mediaAsset.originalFilename, mimeType: mediaAsset.mimeType })), productImages: undefined, available: balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) })) });
});

storeRouter.get("/stock", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const products = await prisma.product.findMany({
    where: { businessId: business.id, state: "ACTIVE", isPublished: true },
    select: { id: true, balances: { where: { branch: { businessId: business.id } }, select: { onHand: true, reserved: true } } },
  });
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  response.json({ data: products.map(({ id, balances }) => ({
    productId: id,
    available: balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0),
  })) });
});

storeRouter.get("/products/:sku", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const product = await prisma.product.findFirst({ where: { businessId: business.id, sku: request.params.sku as string, state: "ACTIVE", isPublished: true }, include: { balances: { where: { branch: { businessId: business.id } }, select: { onHand: true, reserved: true } }, productImages: { where: { mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } }, orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }], include: { mediaAsset: { select: { id: true, secureUrl: true, originalFilename: true, mimeType: true } } } }, specifications: { orderBy: { position: "asc" } } } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  if (product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) <= 0) {
    throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  }
  const [metadata, reviews] = await Promise.all([
    getStorefrontProductMetadata(business.id, [product.id]),
    prisma.productReview.findMany({
      where: { businessId: business.id, productId: product.id },
      select: { rating: true, comment: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);
  const { costPrice: _cost, bottomPrice: _bottomPrice, createdById: _createdBy, normalizedName: _normalizedName, balances, ...publicProduct } = product;
  response.set("Cache-Control", "no-store, no-cache, must-revalidate");
  const { productImages, ...productFields } = publicProduct;
  response.json({ data: {
    ...productFields,
    ...metadata.get(product.id),
    reviews: reviews.map((review) => ({ ...review, author: "Verified customer" })),
    images: productImages.map(({ id, view, position, isPrimary, mediaAsset }) => ({ id, view, position, isPrimary, imageUrl: mediaAsset.secureUrl, originalFilename: mediaAsset.originalFilename, mimeType: mediaAsset.mimeType })),
    available: balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0),
  } });
});

storeRouter.post("/orders", async (request, response) => {
  const parsed = checkoutSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check your checkout details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const input = parsed.data;
  if (input.fulfillmentMethod === "DELIVERY" && !input.deliveryAddress) throw new ApiError(400, "Enter a delivery address.", "DELIVERY_ADDRESS_REQUIRED");
  if (input.fulfillmentMethod === "DELIVERY" && input.paymentOption !== "PAYSTACK") {
    throw new ApiError(400, "Direct delivery requires online payment.", "DELIVERY_REQUIRES_ONLINE_PAYMENT");
  }
  if (input.fulfillmentMethod === "COLLECTION" && !input.branchId) throw new ApiError(400, "Choose a pickup location.", "PICKUP_LOCATION_REQUIRED");
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  const business = await resolveStoreBusiness(storeSlug);
  const businessSettings = await prisma.business.findUniqueOrThrow({
    where: { id: business.id },
    select: { onlineDeliveryEnabled: true, onlineDeliveryFee: true, payOnPickupEnabled: true, currency: true },
  });
  if (input.fulfillmentMethod === "DELIVERY" && !businessSettings.onlineDeliveryEnabled) {
    throw new ApiError(409, "Direct delivery is not currently available.", "DELIVERY_UNAVAILABLE");
  }
  if (input.paymentOption === "PAY_ON_PICKUP" && (
    input.fulfillmentMethod !== "COLLECTION" || !businessSettings.payOnPickupEnabled
  )) {
    throw new ApiError(400, "Pay on pickup is not enabled for this order.", "PAY_ON_PICKUP_UNAVAILABLE");
  }
  const uniqueIds = [...new Set(input.lines.map((line) => line.productId))];
  if (uniqueIds.length !== input.lines.length) throw new ApiError(400, "Each product can appear only once in the cart.", "DUPLICATE_CART_LINE");
  let branch = input.branchId
    ? await prisma.branch.findFirst({
        where: {
          id: input.branchId,
          businessId: business.id,
          ...(input.fulfillmentMethod === "COLLECTION"
            ? { isPickupLocation: true, address: { not: null } }
            : {}),
        },
        include: { business: true },
      })
    : null;
  if (input.fulfillmentMethod === "DELIVERY" && !branch) {
    branch = await prisma.branch.findFirst({ where: { businessId: business.id, isDefault: true }, include: { business: true } })
      ?? await prisma.branch.findFirst({ where: { businessId: business.id }, include: { business: true }, orderBy: { createdAt: "asc" } });
  }
  if (!branch) throw new ApiError(404, "Store location not found.", "STORE_NOT_FOUND");
  const branches = await prisma.branch.findMany({ where: { businessId: branch.businessId }, select: { id: true }, orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }] });
  const products = await prisma.product.findMany({
    where: { id: { in: uniqueIds }, businessId: branch.businessId, state: "ACTIVE", isPublished: true },
    include: { balances: { where: { branchId: { in: branches.map(({ id }) => id) } } } },
  });
  if (products.length !== uniqueIds.length) throw new ApiError(409, "One or more products are no longer available.", "PRODUCT_UNAVAILABLE");
  const productMap = new Map(products.map((product) => [product.id, product]));
  const snapshot = input.lines.map((line) => {
    const product = productMap.get(line.productId)!;
    const available = product.balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0);
    if (line.quantity > available) throw new ApiError(409, `${product.name} does not have enough available stock.`, "INSUFFICIENT_STOCK", { productId: product.id, available });
    let remaining = line.quantity;
    const allocations = [...product.balances]
      .sort((a, b) => Number(b.onHand) - Number(b.reserved) - (Number(a.onHand) - Number(a.reserved)))
      .flatMap((balance) => {
        const branchAvailable = Number(balance.onHand) - Number(balance.reserved);
        const quantity = Math.min(remaining, Math.max(0, branchAvailable));
        remaining -= quantity;
        return quantity > 0 ? [{ branchId: balance.branchId, quantity }] : [];
      });
    return { product, quantity: line.quantity, allocations, unitPrice: Number(product.sellingPrice), unitCost: Number(product.costPrice), lineTotal: Number(product.sellingPrice) * line.quantity };
  });
  const subtotal = snapshot.reduce((sum, line) => sum + line.lineTotal, 0);
  const isFreeDelivery = subtotal >= 100_000;
  const deliveryFee = input.fulfillmentMethod === "DELIVERY"
    ? (isFreeDelivery ? 0 : Number(businessSettings.onlineDeliveryFee))
    : 0;
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;
  const payOnPickup = input.paymentOption === "PAY_ON_PICKUP";
  const expiresAt = payOnPickup ? null : new Date(Date.now() + 20 * 60 * 1000);
  const orderNo = orderReference();
  let order;
  try {
    order = await prisma.$transaction(async (transaction) => {
      let resolvedCustomerId = input.customerId || null;
      if (!resolvedCustomerId) {
        const existingCust = await transaction.customer.findFirst({
          where: { businessId: branch.businessId, email: { equals: input.email.trim(), mode: "insensitive" } },
          select: { id: true },
        });
        if (existingCust) resolvedCustomerId = existingCust.id;
      }
      const created = await transaction.onlineOrder.create({ data: { businessId: branch.businessId, branchId: branch.id, customerId: resolvedCustomerId, number: orderNo, customerName: input.customerName, customerEmail: input.email.toLowerCase(), customerPhone: input.phone, fulfillmentMethod: input.fulfillmentMethod, deliveryAddress: input.deliveryAddress, subtotal, deliveryFee, total, expiresAt, lines: { create: snapshot.map((line) => ({ productId: line.product.id, productName: line.product.name, sku: line.product.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) } } });
      for (const line of snapshot) {
        for (const allocation of line.allocations) {
          const balance = line.product.balances.find((item) => item.branchId === allocation.branchId)!;
          const onHand = new Prisma.Decimal(balance.onHand);
          const reserved = new Prisma.Decimal(balance.reserved);
          const updated = await transaction.stockBalance.updateMany({ where: { productId: line.product.id, branchId: allocation.branchId, onHand, reserved }, data: { reserved: { increment: allocation.quantity } } });
          if (updated.count !== 1) throw new ApiError(409, "Stock changed while checkout was being reserved. Refresh your cart.", "STOCK_CONFLICT");
          const reservation = await transaction.stockReservation.create({ data: { businessId: branch.businessId, branchId: allocation.branchId, productId: line.product.id, onlineOrderId: created.id, quantity: allocation.quantity, expiresAt } });
          await reserveFefoLots(transaction, { reservationId: reservation.id, productId: line.product.id, branchId: allocation.branchId, quantity: allocation.quantity });
        }
      }
      const payRef = `${payOnPickup ? "PICKUP" : "PAY"}-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
      const payment = await transaction.payment.create({
        data: {
          businessId: branch.businessId,
          onlineOrderId: created.id,
          method: payOnPickup ? "CASH" : "ONLINE",
          status: "PENDING",
          amount: total,
          provider: payOnPickup ? null : "PAYSTACK",
          providerReference: payOnPickup ? null : payRef,
          reference: payOnPickup ? `PICKUP-${created.number}` : payRef,
        },
      });
      if (payOnPickup) {
        const content = orderEmailContent({
          orderNumber: created.number,
          customerName: created.customerName,
          businessName: branch.business.name,
          fulfillmentMethod: created.fulfillmentMethod,
          deliveryAddress: created.deliveryAddress,
          branchName: branch.name,
          branchAddress: branch.address,
          total,
          currency: businessSettings.currency,
          paymentMessage: "Payment is due at the pickup branch. The order will be prepared after staff records your payment.",
          lines: snapshot.map((line) => ({
            productName: line.product.name,
            sku: line.product.sku,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            lineTotal: line.lineTotal,
          })),
        });
        await transaction.emailOutbox.create({
          data: orderEmailOutboxData({
            businessId: branch.businessId,
            email: created.customerEmail,
            content,
          }),
        });
      }
      await writeAudit(transaction, { businessId: branch.businessId, action: "ONLINE_ORDER_CREATED", entityType: "OnlineOrder", entityId: created.id, after: { number: created.number, total, paymentReference: payment.reference } });
      return { ...created, payment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) throw new ApiError(409, "Stock or checkout changed during checkout. Refresh your cart.", "CHECKOUT_CONFLICT");
    throw error;
  }

  // Deliver order confirmation email to customer immediately via Resend
  try {
    const emailBusiness = await prisma.business.findUnique({
      where: { id: branch.businessId },
      select: { name: true, currency: true },
    });
    const orderMail = orderEmailContent({
      orderNumber: order.number,
      customerName: order.customerName,
      businessName: emailBusiness?.name || "Oceanic Tools Monger",
      fulfillmentMethod: order.fulfillmentMethod,
      deliveryAddress: order.deliveryAddress,
      branchName: branch.name,
      branchAddress: branch.address,
      total,
      currency: businessSettings.currency,
      paymentMessage: input.paymentOption === "PAY_ON_PICKUP"
        ? "Payment is due upon pickup at our store branch. Your order will be prepared by our team."
        : "Your order has been recorded. Please complete payment via our secure portal.",
      lines: snapshot.map((line) => ({
        productName: line.product.name,
        sku: line.product.sku,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
    });

    sendEmail({
      businessId: branch.businessId,
      to: order.customerEmail,
      subject: orderMail.subject,
      text: orderMail.text,
      html: orderMail.html,
      kind: "ORDER_CONFIRMATION",
    }).catch((emailErr) => {
      console.warn("[Store] Immediate order confirmation email warning:", emailErr);
    });
  } catch (err) {
    console.warn("[Store] Could not dispatch immediate order confirmation email:", err);
  }

  if (input.paymentOption === "PAY_ON_PICKUP") {
    response.status(201).json({
      data: {
        orderNumber: order.number,
        status: order.status,
        paymentDueAtPickup: true,
        payment: { reference: order.payment.reference },
        expiresAt,
      },
    });
    return;
  }

  try {
    const providerResult = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: input.email, amount: minorUnits(total), currency: businessSettings.currency, reference: order.payment.reference, callback_url: process.env.STORE_PAYMENT_CALLBACK_URL, channels: ["card", "bank_transfer"], metadata: { orderId: order.id, orderNumber: order.number } }) });
    await prisma.payment.update({ where: { id: order.payment.id }, data: { providerReference: providerResult.reference } });
    response.status(201).json({ data: { orderNumber: order.number, status: order.status, payment: { authorizationUrl: providerResult.authorization_url, accessCode: providerResult.access_code, reference: providerResult.reference }, expiresAt } });
  } catch (error) {
    await releaseOrderReservation(order.id, "PAYMENT_PROVIDER_ERROR");
    throw error;
  }
});

storeRouter.get("/payments/:reference/verify", async (request, response) => {
  const reference = z.string().min(8).max(80).safeParse(request.params.reference as string);
  if (!reference.success) throw new ApiError(400, "Invalid payment reference.", "INVALID_REFERENCE");
  const localPayment = await prisma.payment.findFirst({
    where: { reference: reference.data, onlineOrder: { isNot: null } },
    include: { onlineOrder: { include: { branch: { select: { name: true, address: true } } } } },
  });
  if (!localPayment || !localPayment.onlineOrder) throw new ApiError(404, "Payment not found.", "PAYMENT_NOT_FOUND");
  if (localPayment.provider === null && localPayment.reference.startsWith("PICKUP-") && localPayment.onlineOrder.fulfillmentMethod === "COLLECTION") {
    const order = await getPublicOnlineOrderDetails(localPayment.onlineOrder.id);
    response.json({
      data: {
        status: localPayment.status === "SUCCEEDED"
          ? "SUCCEEDED"
          : localPayment.status === "PENDING" && localPayment.onlineOrder.status === "PENDING_PAYMENT"
            ? "DUE_AT_PICKUP"
            : localPayment.status,
        paidAt: localPayment.paidAt,
        orderNumber: localPayment.onlineOrder.number,
        pickupLocation: {
          name: localPayment.onlineOrder.branch.name,
          address: localPayment.onlineOrder.branch.address,
        },
        order: trackedOrderData(order),
      },
    });
    return;
  }
  if (localPayment.provider !== "PAYSTACK") throw new ApiError(404, "Payment not found.", "PAYMENT_NOT_FOUND");
  const providerResult = await paystackRequest<{ status: string; reference: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference.data)}`, { method: "GET" });
  await settleOnlinePayment(localPayment.id, providerResult);
  const [payment, order] = await Promise.all([
    prisma.payment.findUnique({ where: { id: localPayment.id }, select: { status: true, paidAt: true } }),
    getPublicOnlineOrderDetails(localPayment.onlineOrder.id),
  ]);
  response.json({
    data: {
      status: payment?.status,
      paidAt: payment?.paidAt,
      orderNumber: localPayment.onlineOrder.number,
      order: trackedOrderData(order),
    },
  });
});

type VerifiedTransaction = { status: string; reference: string; amount: number; currency: string; paid_at?: string };

async function settleOnlinePayment(paymentId: string, verified: VerifiedTransaction) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { onlineOrder: { include: { lines: true, reservations: { include: { lots: true } } } } } });
  if (!payment || !payment.onlineOrder) throw new ApiError(404, "Online payment is not linked to an order.", "ORDER_NOT_FOUND");
  const order = payment.onlineOrder;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: order.businessId }, select: { currency: true } });
  const verifiedSuccess = verified.status === "success" && verified.reference === payment.providerReference && verified.amount === minorUnits(Number(payment.amount)) && verified.currency === business.currency;
  if (!verifiedSuccess) {
    if (verified.status === "failed" || verified.status === "abandoned") {
      await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED" } });
      await releaseOrderReservation(order.id, "PAYMENT_FAILED");
    }
    return;
  }
  await completeOnlineOrderPayment(payment.id, {
    paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date(),
    ledgerAccountCode: "1020",
    ledgerDescription: "Verified Paystack settlement receivable",
    auditAction: "ONLINE_PAYMENT_VERIFIED",
    notificationTitle: "Online order paid",
    notificationMessage: `Order ${order.number} has been paid and is ready for processing.`,
    movementActorType: "PAYMENT_PROVIDER",
  });
}

async function completeOnlineOrderPayment(
  paymentId: string,
  options: {
    paidAt: Date;
    ledgerAccountCode: string;
    ledgerDescription: string;
    auditAction: string;
    notificationTitle: string;
    notificationMessage: string;
    movementActorType: string;
    userId?: string;
    method?: "CASH" | "BANK_TRANSFER" | "CARD";
    reference?: string;
  },
) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: { onlineOrder: true } });
  if (!payment?.onlineOrder) throw new ApiError(404, "Online payment is not linked to an order.", "ORDER_NOT_FOUND");
  const order = payment.onlineOrder;
  try {
    await prisma.$transaction(async (transaction) => {
      const lockedPayment = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (lockedPayment.status === "SUCCEEDED") return;
      const liveOrder = await transaction.onlineOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true, reservations: { include: { lots: true } } } });
      if (liveOrder.status !== "PENDING_PAYMENT" || liveOrder.expiresAt && liveOrder.expiresAt <= new Date()) throw new ApiError(409, "This order is no longer payable.", "ORDER_EXPIRED");
      const lotAllocationsByProduct = new Map<string, Awaited<ReturnType<typeof consumeReservedLots>>>();
      for (const line of liveOrder.lines) {
        const reservations = liveOrder.reservations.filter((item) => item.productId === line.productId && item.status === "ACTIVE");
        const reservedQuantity = reservations.reduce((sum, item) => sum + Number(item.quantity), 0);
        if (!reservations.length || reservedQuantity < Number(line.quantity)) throw new ApiError(409, "Order stock reservation is missing or insufficient.", "RESERVATION_INVALID");
        const lotsForProduct: Awaited<ReturnType<typeof consumeReservedLots>> = [];
        for (const reservation of reservations) {
          const changed = await transaction.stockBalance.updateMany({ where: { productId: line.productId, branchId: reservation.branchId, onHand: { gte: reservation.quantity }, reserved: { gte: reservation.quantity } }, data: { onHand: { decrement: reservation.quantity }, reserved: { decrement: reservation.quantity } } });
          if (changed.count !== 1) throw new ApiError(409, "Reserved stock changed before payment confirmation.", "STOCK_CONFLICT");
          const lots = await consumeReservedLots(transaction, reservation.id);
          if (!new Prisma.Decimal(lots.reduce((sum, lot) => sum + Number(lot.quantity), 0)).equals(reservation.quantity)) throw new ApiError(409, "Reserved batch quantities do not match the order.", "RESERVATION_INVALID");
          for (const lot of lots) {
            const updatedLot = await transaction.stockLot.updateMany({ where: { id: lot.stockLotId, quantity: { gte: lot.quantity }, reserved: { gte: lot.quantity } }, data: { quantity: { decrement: lot.quantity }, reserved: { decrement: lot.quantity } } });
            if (updatedLot.count !== 1) throw new ApiError(409, "Reserved batch stock changed before payment confirmation.", "STOCK_LOT_CONFLICT");
          }
          lotsForProduct.push(...lots);
          await transaction.stockMovement.create({ data: { productId: line.productId, branchId: reservation.branchId, actorType: options.movementActorType, userId: options.userId, type: "SALE", quantity: new Prisma.Decimal(reservation.quantity).negated(), unitCost: line.unitCost, reference: liveOrder.number } });
          await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });
        }
        if (!new Prisma.Decimal(reservedQuantity).equals(line.quantity)) throw new ApiError(409, "Order reservations exceed the ordered quantity.", "RESERVATION_INVALID");
        lotAllocationsByProduct.set(line.productId, lotsForProduct);
      }
      const sale = await transaction.sale.create({ data: { businessId: liveOrder.businessId, branchId: liveOrder.branchId, customerId: liveOrder.customerId, actorType: "CUSTOMER_CHECKOUT", number: liveOrder.number, channel: "ONLINE", subtotal: liveOrder.subtotal, discount: liveOrder.discount, tax: liveOrder.tax, deliveryFee: liveOrder.deliveryFee, total: liveOrder.total, lines: { create: liveOrder.lines.map((line) => ({ productId: line.productId, productName: line.productName, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) }, }, include: { lines: true } });
      let cogs = 0;
      for (const line of liveOrder.lines) {
        const saleLine = sale.lines.find((item) => item.productId === line.productId)!;
        const lots = lotAllocationsByProduct.get(line.productId) ?? [];
        const cost = lots.reduce((sum, lot) => sum + Number(lot.unitCost) * Number(lot.quantity), 0);
        cogs += cost;
        await transaction.saleLine.update({ where: { id: saleLine.id }, data: { unitCost: cost / Number(line.quantity) } });
        await transaction.saleLotAllocation.createMany({ data: lots.map((lot) => ({ saleLineId: saleLine.id, stockLotId: lot.stockLotId, quantity: lot.quantity, unitCost: lot.unitCost })) });
      }
      await transaction.salePaymentAllocation.create({ data: { saleId: sale.id, paymentId: payment.id, amount: payment.amount } });
      const ledgerLines: LedgerLine[] = [{ code: options.ledgerAccountCode, debit: Number(payment.amount), description: options.ledgerDescription }, { code: "4000", credit: Number(liveOrder.subtotal), description: "Online sales revenue" }];
      if (Number(liveOrder.discount) > 0) ledgerLines.push({ code: "4100", debit: Number(liveOrder.discount), description: "Online sales discount" });
      if (Number(liveOrder.deliveryFee) > 0) ledgerLines.push({ code: "4200", credit: Number(liveOrder.deliveryFee), description: "Delivery charge" });
      if (Number(liveOrder.tax) > 0) ledgerLines.push({ code: "2100", credit: Number(liveOrder.tax), description: "Sales tax payable" });
      if (cogs > 0) ledgerLines.push({ code: "5000", debit: cogs, description: "Cost of goods sold" }, { code: "1200", credit: cogs, description: "Inventory relieved" });
      await postLedgerEntry(transaction, { businessId: liveOrder.businessId, userId: options.userId, sourceType: "ONLINE_SALE", sourceId: sale.id, description: `Online sale ${sale.number}`, lines: ledgerLines });
      await transaction.payment.update({
        where: { id: payment.id },
        data: {
          status: "SUCCEEDED",
          paidAt: options.paidAt,
          ...(options.method ? { method: options.method } : {}),
        },
      });
      await transaction.onlineOrder.update({ where: { id: liveOrder.id }, data: { status: "PAID" } });
      await transaction.notification.create({ data: { businessId: liveOrder.businessId, type: "ONLINE_ORDER", severity: "INFO", title: options.notificationTitle, message: options.notificationMessage, entityType: "OnlineOrder", entityId: liveOrder.id, dedupeKey: `ORDER-PAID:${liveOrder.id}` } });
      const [emailBusiness, emailBranch] = await Promise.all([
        transaction.business.findUniqueOrThrow({ where: { id: liveOrder.businessId }, select: { name: true, currency: true } }),
        transaction.branch.findUniqueOrThrow({ where: { id: liveOrder.branchId }, select: { name: true, address: true } }),
      ]);
      const content = orderEmailContent({
        orderNumber: liveOrder.number,
        customerName: liveOrder.customerName,
        businessName: emailBusiness.name,
        fulfillmentMethod: liveOrder.fulfillmentMethod,
        deliveryAddress: liveOrder.deliveryAddress,
        branchName: emailBranch.name,
        branchAddress: emailBranch.address,
        total: Number(liveOrder.total),
        currency: emailBusiness.currency,
        paymentMessage: "Payment has been confirmed. Your order is being prepared.",
        lines: liveOrder.lines.map((line) => ({
          productName: line.productName,
          sku: line.sku,
          quantity: line.quantity.toString(),
          unitPrice: line.unitPrice.toString(),
          lineTotal: line.lineTotal.toString(),
        })),
      });
      await transaction.emailOutbox.create({
        data: orderEmailOutboxData({
          businessId: liveOrder.businessId,
          email: liveOrder.customerEmail,
          content,
        }),
      });
      // Dispatch payment confirmed email immediately to customer
      sendEmail({
        businessId: liveOrder.businessId,
        to: liveOrder.customerEmail,
        subject: content.subject,
        text: content.text,
        html: content.html,
        kind: "ORDER_PAID_CONFIRMATION",
      }).catch((e) => console.warn("[Store] Immediate payment confirmation email warning:", e));
      await writeAudit(transaction, { businessId: liveOrder.businessId, userId: options.userId, action: options.auditAction, entityType: "Payment", entityId: payment.id, after: { orderId: liveOrder.id, amount: payment.amount.toString(), method: options.method ?? "ONLINE", ...(options.reference ? { reference: options.reference } : {}) } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}

async function releaseOrderReservation(orderId: string, reason: string) {
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.onlineOrder.findUnique({ where: { id: orderId }, include: { reservations: true } });
    if (!order) return;
    for (const reservation of order.reservations.filter((item) => item.status === "ACTIVE")) {
      await releaseReservedLots(transaction, reservation.id);
      await transaction.stockBalance.update({ where: { productId_branchId: { productId: reservation.productId, branchId: reservation.branchId } }, data: { reserved: { decrement: reservation.quantity } } });
      await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "RELEASED" } });
    }
    if (order.status === "PENDING_PAYMENT") await transaction.onlineOrder.update({ where: { id: order.id }, data: { status: reason === "PAYMENT_FAILED" ? "PAYMENT_FAILED" : "CANCELLED" } });
    await transaction.payment.updateMany({ where: { onlineOrderId: orderId, status: "PENDING" }, data: { status: "FAILED" } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

paystackWebhookRouter.post("/paystack", async (request, response) => {
  const rawBody = request.body as Buffer;
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const signature = request.get("x-paystack-signature");
  if (!secret || !signature || !Buffer.isBuffer(rawBody)) throw new ApiError(401, "Invalid payment webhook.", "INVALID_WEBHOOK");
  const expected = createHmac("sha512", secret).update(rawBody).digest("hex");
  const providedBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) throw new ApiError(401, "Invalid payment webhook signature.", "INVALID_WEBHOOK_SIGNATURE");
  let event: { event?: string; data?: { id?: number; reference?: string; refund_reference?: string; transaction_reference?: string; status?: string; amount?: number | string; currency?: string; paid_at?: string } };
  try { event = JSON.parse(rawBody.toString("utf8")); } catch { throw new ApiError(400, "Malformed webhook payload.", "INVALID_WEBHOOK_BODY"); }
  const provider = "PAYSTACK";
  const eventId = `${provider}:${event.event ?? "unknown"}:${event.data?.id ?? event.data?.refund_reference ?? event.data?.reference ?? randomUUID()}:${event.data?.status ?? "unknown"}`;
  const ref = event.data?.reference;
  let payment = ref ? await prisma.payment.findFirst({ where: { provider, providerReference: ref }, include: { onlineOrder: true } }) : null;
  try {
    await prisma.paymentProviderEvent.create({ data: { paymentId: payment?.id, provider, eventId, eventType: event.event ?? "unknown", payload: event as Prisma.InputJsonValue } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return response.status(200).json({ received: true, duplicate: true });
    throw error;
  }
  if (event.event === "charge.success" && payment && ref) {
    const verified = await paystackRequest<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(ref)}`, { method: "GET" });
    await settleOnlinePayment(payment.id, verified);
  }
  if (event.event?.startsWith("refund.")) {
    let refund = event.data?.refund_reference ? await prisma.refund.findUnique({ where: { reference: event.data.refund_reference } }) : null;
    // Paystack's initial refund.pending webhook may have a null refund_reference.
    // In that case correlate the event to a single pending refund by the original
    // transaction reference and amount.
    if (!refund && event.data?.transaction_reference && event.data.amount !== undefined) {
      const amount = Number(event.data.amount) / 100;
      const candidates = await prisma.refund.findMany({
        where: {
          method: "ONLINE", status: "PENDING", amount,
          sale: { payments: { some: { payment: { provider: "PAYSTACK", providerReference: event.data.transaction_reference } } } },
        },
        take: 2,
      });
      if (candidates.length === 1) refund = candidates[0];
    }
    if (refund && refund.method === "ONLINE") {
      const refundStatus = event.event === "refund.processed" ? "SUCCEEDED" : event.event === "refund.failed" ? "FAILED" : "PENDING";
      if (refund.status !== refundStatus) {
        await prisma.$transaction(async (transaction) => {
          await transaction.refund.update({ where: { id: refund.id }, data: { status: refundStatus } });
          if (refundStatus === "SUCCEEDED") {
            await postLedgerEntry(transaction, { businessId: (await transaction.sale.findUniqueOrThrow({ where: { id: refund.saleId }, select: { businessId: true } })).businessId, userId: refund.userId, sourceType: "REFUND", sourceId: refund.id, description: `Paystack refund ${refund.reference} completed`, lines: [{ code: "2200", debit: refund.amount, description: "Clear confirmed customer refund payable" }, { code: "1010", credit: refund.amount, description: "Refund paid through Paystack" }] });
            await writeAudit(transaction, { businessId: (await transaction.sale.findUniqueOrThrow({ where: { id: refund.saleId }, select: { businessId: true } })).businessId, userId: refund.userId, action: "PAYSTACK_REFUND_CONFIRMED", entityType: "Refund", entityId: refund.id, after: { status: "SUCCEEDED", amount: refund.amount.toString(), providerReference: event.data?.refund_reference } });
          }
        });
      }
    }
  }
  payment = ref ? await prisma.payment.findFirst({ where: { provider, providerReference: ref }, include: { onlineOrder: true } }) : null;
  response.status(200).json({ received: true, processed: Boolean(payment) });
});
