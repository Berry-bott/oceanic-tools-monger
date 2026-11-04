import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { Router } from "express";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { postLedgerEntry, type LedgerLine } from "../lib/accounting.js";
import { consumeReservedLots, releaseReservedLots, reserveFefoLots } from "../lib/stock-lots.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const storeRouter = Router();
export const paystackWebhookRouter = Router();
export const onlineOrdersRouter = Router();
const checkoutSchema = z.object({ branchId: z.string().optional(), customerName: z.string().trim().min(1).max(180), email: z.email(), phone: z.string().trim().max(40).optional(), fulfillmentMethod: z.enum(["DELIVERY", "COLLECTION"]), deliveryAddress: z.string().trim().max(1000).optional(), lines: z.array(z.object({ productId: z.string(), quantity: z.coerce.number().positive() })).min(1).max(50) });
const orderReference = () => `WEB-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
const minorUnits = (amount: number) => Math.round(amount * 100);

onlineOrdersRouter.use(requireAuth);
onlineOrdersRouter.get("/", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const status = typeof request.query.status === "string" ? request.query.status : undefined;
  const branchId = typeof request.query.branchId === "string" ? request.query.branchId : undefined;
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const where = { businessId: auth.businessId, ...(branchId ? { branchId } : {}), ...(status && Object.values(["PENDING_PAYMENT", "PAYMENT_FAILED", "PAID", "PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "DELIVERED", "COLLECTED", "PARTIALLY_FULFILLED", "CANCELLED", "RETURN_REQUESTED"]).includes(status) ? { status: status as never } : {}) };
  const [data, statusCounts] = await Promise.all([
    prisma.onlineOrder.findMany({ where, include: { lines: true, payments: { select: { method: true, status: true, amount: true, reference: true } }, reservations: true }, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.onlineOrder.groupBy({ by: ["status"], where, _count: { _all: true } }),
  ]);
  response.json({ data, counts: Object.fromEntries(statusCounts.map((entry) => [entry.status, entry._count._all])) });
});

onlineOrdersRouter.post("/:orderId/transition", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const parsed = z.object({ status: z.enum(["PROCESSING", "READY_FOR_COLLECTION", "DISPATCHED", "DELIVERED", "COLLECTED", "CANCELLED", "RETURN_REQUESTED"]) }).safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Choose a valid order status.", "VALIDATION_ERROR", parsed.error.issues);
  const auth = response.locals.auth as AuthContext;
  const order = await prisma.onlineOrder.findFirst({ where: { id: request.params.orderId as string, businessId: auth.businessId } });
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

storeRouter.get("/products", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  if (!storeSlug) throw new ApiError(400, "Select a store.", "STORE_REQUIRED");
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const search = typeof request.query.search === "string" ? request.query.search.trim() : "";
  const products = await prisma.product.findMany({ where: { businessId: business.id, state: "ACTIVE", isPublished: true, ...(search ? { OR: [{ name: { contains: search, mode: "insensitive" } }, { category: { contains: search, mode: "insensitive" } }] } : {}) }, include: { balances: { where: { branch: { businessId: business.id, isDefault: true } }, select: { onHand: true, reserved: true } }, productImages: { where: { mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } }, orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }], include: { mediaAsset: { select: { id: true, secureUrl: true, originalFilename: true, mimeType: true } } } } }, orderBy: { name: "asc" }, take: 100 });
  response.set("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
  response.json({ data: products.map(({ costPrice: _costPrice, createdById: _createdBy, normalizedName: _normalized, balances, ...product }) => ({ ...product, images: product.productImages.map(({ id, view, position, mediaAsset }) => ({ id, view, position, imageUrl: mediaAsset.secureUrl, originalFilename: mediaAsset.originalFilename, mimeType: mediaAsset.mimeType })), productImages: undefined, available: balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) })) });
});

storeRouter.get("/products/:sku", async (request, response) => {
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  if (!storeSlug) throw new ApiError(400, "Select a store.", "STORE_REQUIRED");
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const product = await prisma.product.findFirst({ where: { businessId: business.id, sku: request.params.sku as string, state: "ACTIVE", isPublished: true }, include: { balances: { where: { branch: { businessId: business.id, isDefault: true } }, select: { onHand: true, reserved: true } }, productImages: { where: { mediaAsset: { status: "ACTIVE", secureUrl: { not: null } } }, orderBy: [{ isPrimary: "desc" }, { view: "asc" }, { position: "asc" }], include: { mediaAsset: { select: { id: true, secureUrl: true, originalFilename: true, mimeType: true } } } }, specifications: { orderBy: { position: "asc" } } } });
  if (!product) throw new ApiError(404, "Product not found.", "PRODUCT_NOT_FOUND");
  const { costPrice: _cost, createdById: _createdBy, normalizedName: _normalizedName, balances, ...publicProduct } = product;
  response.set("Cache-Control", "public, max-age=30, stale-while-revalidate=30");
  const { productImages, ...productFields } = publicProduct;
  response.json({ data: { ...productFields, images: productImages.map(({ id, view, position, isPrimary, mediaAsset }) => ({ id, view, position, isPrimary, imageUrl: mediaAsset.secureUrl, originalFilename: mediaAsset.originalFilename, mimeType: mediaAsset.mimeType })), available: balances.reduce((sum, balance) => sum + Number(balance.onHand) - Number(balance.reserved), 0) } });
});

storeRouter.post("/orders", async (request, response) => {
  const parsed = checkoutSchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, "Check your checkout details and try again.", "VALIDATION_ERROR", parsed.error.issues);
  const input = parsed.data;
  if (input.fulfillmentMethod === "DELIVERY" && !input.deliveryAddress) throw new ApiError(400, "Enter a delivery address.", "DELIVERY_ADDRESS_REQUIRED");
  const storeSlug = typeof request.query.store === "string" ? request.query.store : "";
  if (!storeSlug) throw new ApiError(400, "Select a store.", "STORE_REQUIRED");
  const business = await prisma.business.findUnique({ where: { storeSlug }, select: { id: true } });
  if (!business) throw new ApiError(404, "Store not found.", "STORE_NOT_FOUND");
  const branch = input.branchId
    ? await prisma.branch.findFirst({ where: { id: input.branchId, businessId: business.id }, include: { business: true } })
    : await prisma.branch.findFirst({ where: { businessId: business.id, isDefault: true }, include: { business: true } });
  if (!branch) throw new ApiError(404, "Store location not found.", "STORE_NOT_FOUND");
  const uniqueIds = [...new Set(input.lines.map((line) => line.productId))];
  if (uniqueIds.length !== input.lines.length) throw new ApiError(400, "Each product can appear only once in the cart.", "DUPLICATE_CART_LINE");
  const products = await prisma.product.findMany({ where: { id: { in: uniqueIds }, businessId: branch.businessId, state: "ACTIVE", isPublished: true }, include: { balances: { where: { branchId: branch.id } } } });
  if (products.length !== uniqueIds.length) throw new ApiError(409, "One or more products are no longer available.", "PRODUCT_UNAVAILABLE");
  const productMap = new Map(products.map((product) => [product.id, product]));
  const snapshot = input.lines.map((line) => {
    const product = productMap.get(line.productId)!;
    const balance = product.balances[0];
    const available = Number(balance?.onHand ?? 0) - Number(balance?.reserved ?? 0);
    if (line.quantity > available) throw new ApiError(409, `${product.name} does not have enough available stock.`, "INSUFFICIENT_STOCK", { productId: product.id, available });
    return { product, quantity: line.quantity, unitPrice: Number(product.sellingPrice), unitCost: Number(product.costPrice), lineTotal: Number(product.sellingPrice) * line.quantity };
  });
  const subtotal = snapshot.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = Math.round((subtotal + (input.fulfillmentMethod === "DELIVERY" ? 0 : 0)) * 100) / 100;
  const expiresAt = new Date(Date.now() + 20 * 60 * 1000);
  const orderNo = orderReference();
  let order;
  try {
    order = await prisma.$transaction(async (transaction) => {
      const created = await transaction.onlineOrder.create({ data: { businessId: branch.businessId, branchId: branch.id, number: orderNo, customerName: input.customerName, customerEmail: input.email.toLowerCase(), customerPhone: input.phone, fulfillmentMethod: input.fulfillmentMethod, deliveryAddress: input.deliveryAddress, subtotal, total, expiresAt, lines: { create: snapshot.map((line) => ({ productId: line.product.id, productName: line.product.name, sku: line.product.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) } } });
      for (const line of snapshot) {
        const balance = line.product.balances[0];
        const onHand = new Prisma.Decimal(balance?.onHand ?? 0);
        const reserved = new Prisma.Decimal(balance?.reserved ?? 0);
        if (Number(line.quantity) > Number(onHand.minus(reserved))) throw new ApiError(409, `${line.product.name} is no longer available.`, "INSUFFICIENT_STOCK");
        const updated = await transaction.stockBalance.updateMany({ where: { productId: line.product.id, branchId: branch.id, onHand, reserved }, data: { reserved: { increment: line.quantity } } });
        if (updated.count !== 1) throw new ApiError(409, "Stock changed while checkout was being reserved. Refresh your cart.", "STOCK_CONFLICT");
        const reservation = await transaction.stockReservation.create({ data: { businessId: branch.businessId, branchId: branch.id, productId: line.product.id, onlineOrderId: created.id, quantity: line.quantity, expiresAt } });
        await reserveFefoLots(transaction, { reservationId: reservation.id, productId: line.product.id, branchId: branch.id, quantity: line.quantity });
      }
      const payRef = `PAY-${randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase()}`;
      const payment = await transaction.payment.create({ data: { businessId: branch.businessId, onlineOrderId: created.id, method: "ONLINE", status: "PENDING", amount: total, provider: "PAYSTACK", providerReference: payRef, reference: payRef } });
      await writeAudit(transaction, { businessId: branch.businessId, action: "ONLINE_ORDER_CREATED", entityType: "OnlineOrder", entityId: created.id, after: { number: created.number, total, paymentReference: payment.reference } });
      return { ...created, payment };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2034" || error.code === "P2002")) throw new ApiError(409, "Stock or checkout changed during checkout. Refresh your cart.", "CHECKOUT_CONFLICT");
    throw error;
  }

  try {
    const providerResult = await paystackRequest<{ authorization_url: string; access_code: string; reference: string }>("/transaction/initialize", { method: "POST", body: JSON.stringify({ email: input.email, amount: minorUnits(total), currency: branch.business.currency, reference: order.payment.reference, callback_url: process.env.STORE_PAYMENT_CALLBACK_URL, metadata: { orderId: order.id, orderNumber: order.number } }) });
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
  const localPayment = await prisma.payment.findFirst({ where: { reference: reference.data, provider: "PAYSTACK", onlineOrder: { isNot: null } }, include: { onlineOrder: { include: { lines: true, reservations: true } } } });
  if (!localPayment || !localPayment.onlineOrder) throw new ApiError(404, "Payment not found.", "PAYMENT_NOT_FOUND");
  const providerResult = await paystackRequest<{ status: string; reference: string; amount: number; currency: string; paid_at?: string }>(`/transaction/verify/${encodeURIComponent(reference.data)}`, { method: "GET" });
  await settleOnlinePayment(localPayment.id, providerResult);
  const payment = await prisma.payment.findUnique({ where: { id: localPayment.id }, select: { status: true, paidAt: true } });
  response.json({ data: { status: payment?.status, paidAt: payment?.paidAt, orderNumber: localPayment.onlineOrder.number } });
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
  try {
    await prisma.$transaction(async (transaction) => {
      const lockedPayment = await transaction.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (lockedPayment.status === "SUCCEEDED") return;
      const liveOrder = await transaction.onlineOrder.findUniqueOrThrow({ where: { id: order.id }, include: { lines: true, reservations: { include: { lots: true } } } });
      if (liveOrder.status !== "PENDING_PAYMENT" || liveOrder.expiresAt && liveOrder.expiresAt <= new Date()) throw new ApiError(409, "This order is no longer payable.", "ORDER_EXPIRED");
      const lotAllocationsByProduct = new Map<string, Awaited<ReturnType<typeof consumeReservedLots>>>();
      for (const line of liveOrder.lines) {
        const reservation = liveOrder.reservations.find((item) => item.productId === line.productId && item.status === "ACTIVE");
        if (!reservation || Number(reservation.quantity) < Number(line.quantity)) throw new ApiError(409, "Order stock reservation is missing or insufficient.", "RESERVATION_INVALID");
        const changed = await transaction.stockBalance.updateMany({ where: { productId: line.productId, branchId: liveOrder.branchId, onHand: { gte: line.quantity }, reserved: { gte: line.quantity } }, data: { onHand: { decrement: line.quantity }, reserved: { decrement: line.quantity } } });
        if (changed.count !== 1) throw new ApiError(409, "Reserved stock changed before payment confirmation.", "STOCK_CONFLICT");
        const lots = await consumeReservedLots(transaction, reservation.id);
        if (!new Prisma.Decimal(lots.reduce((sum, lot) => sum + Number(lot.quantity), 0)).equals(line.quantity)) throw new ApiError(409, "Reserved batch quantities do not match the order.", "RESERVATION_INVALID");
        for (const lot of lots) {
          const updatedLot = await transaction.stockLot.updateMany({ where: { id: lot.stockLotId, quantity: { gte: lot.quantity }, reserved: { gte: lot.quantity } }, data: { quantity: { decrement: lot.quantity }, reserved: { decrement: lot.quantity } } });
          if (updatedLot.count !== 1) throw new ApiError(409, "Reserved batch stock changed before payment confirmation.", "STOCK_LOT_CONFLICT");
        }
        lotAllocationsByProduct.set(line.productId, lots);
        await transaction.stockMovement.create({ data: { productId: line.productId, branchId: liveOrder.branchId, actorType: "PAYMENT_PROVIDER", type: "SALE", quantity: new Prisma.Decimal(line.quantity).negated(), unitCost: line.unitCost, reference: liveOrder.number } });
        await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "CONSUMED" } });
      }
      const sale = await transaction.sale.create({ data: { businessId: liveOrder.businessId, branchId: liveOrder.branchId, actorType: "CUSTOMER_CHECKOUT", number: liveOrder.number, channel: "ONLINE", subtotal: liveOrder.subtotal, discount: liveOrder.discount, tax: liveOrder.tax, deliveryFee: liveOrder.deliveryFee, total: liveOrder.total, lines: { create: liveOrder.lines.map((line) => ({ productId: line.productId, productName: line.productName, sku: line.sku, quantity: line.quantity, unitPrice: line.unitPrice, unitCost: line.unitCost, lineTotal: line.lineTotal })) }, }, include: { lines: true } });
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
      const ledgerLines: LedgerLine[] = [{ code: "1020", debit: Number(payment.amount), description: "Verified Paystack settlement receivable" }, { code: "4000", credit: Number(liveOrder.subtotal), description: "Online sales revenue" }];
      if (Number(liveOrder.discount) > 0) ledgerLines.push({ code: "4100", debit: Number(liveOrder.discount), description: "Online sales discount" });
      if (Number(liveOrder.deliveryFee) > 0) ledgerLines.push({ code: "4200", credit: Number(liveOrder.deliveryFee), description: "Delivery charge" });
      if (Number(liveOrder.tax) > 0) ledgerLines.push({ code: "2100", credit: Number(liveOrder.tax), description: "Sales tax payable" });
      if (cogs > 0) ledgerLines.push({ code: "5000", debit: cogs, description: "Cost of goods sold" }, { code: "1200", credit: cogs, description: "Inventory relieved" });
      await postLedgerEntry(transaction, { businessId: liveOrder.businessId, sourceType: "ONLINE_SALE", sourceId: sale.id, description: `Online sale ${sale.number}`, lines: ledgerLines });
      await transaction.payment.update({ where: { id: payment.id }, data: { status: "SUCCEEDED", paidAt: verified.paid_at ? new Date(verified.paid_at) : new Date() } });
      await transaction.onlineOrder.update({ where: { id: liveOrder.id }, data: { status: "PAID" } });
      await transaction.notification.create({ data: { businessId: liveOrder.businessId, type: "ONLINE_ORDER", severity: "INFO", title: "Online order paid", message: `Order ${liveOrder.number} has been paid and is ready for processing.`, entityType: "OnlineOrder", entityId: liveOrder.id, dedupeKey: `ORDER-PAID:${liveOrder.id}` } });
      await writeAudit(transaction, { businessId: liveOrder.businessId, action: "ONLINE_PAYMENT_VERIFIED", entityType: "Payment", entityId: payment.id, after: { orderId: liveOrder.id, amount: payment.amount.toString() } });
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
  let event: { event?: string; data?: { id?: number; reference?: string; status?: string; amount?: number; currency?: string; paid_at?: string } };
  try { event = JSON.parse(rawBody.toString("utf8")); } catch { throw new ApiError(400, "Malformed webhook payload.", "INVALID_WEBHOOK_BODY"); }
  const provider = "PAYSTACK";
  const eventId = `${provider}:${event.data?.id ?? randomUUID()}`;
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
  payment = ref ? await prisma.payment.findFirst({ where: { provider, providerReference: ref }, include: { onlineOrder: true } }) : null;
  response.status(200).json({ received: true, processed: Boolean(payment) });
});
