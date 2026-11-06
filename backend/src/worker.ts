import "dotenv/config";
import { Prisma } from "@prisma/client";
import { prisma } from "./lib/prisma.js";
import { writeAudit } from "./lib/audit.js";
import { safeErrorMetadata } from "./lib/safe-error.js";

const dailyOutOfStockReminders = new Map<string, string>();

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

function safeFailureMessage(error: unknown) {
  return safeErrorMetadata(error).errorMessage ?? "Unknown provider failure";
}

function localClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${value.year}-${value.month}-${value.day}`, hour: Number(value.hour) };
}

async function dispatchDeliveries() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  const jobs = await prisma.notificationDelivery.findMany({ where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: now } }, { status: "PROCESSING", updatedAt: { lte: staleBefore } }] }, include: { notification: true }, orderBy: { createdAt: "asc" }, take: 30 });
  for (const job of jobs) {
    const claimed = await prisma.notificationDelivery.updateMany({ where: { id: job.id, status: job.status, ...(job.status === "PROCESSING" ? { updatedAt: { lte: staleBefore } } : { nextAttemptAt: { lte: now } }) }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      if (job.notification.type === "CUSTOMER_DEBT" && job.notification.entityType === "Customer" && job.notification.entityId) {
        const customer = await prisma.customer.findFirst({ where: { id: job.notification.entityId, businessId: job.notification.businessId }, include: { sales: { where: { status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } } } } } });
        const stillConsented = customer && (job.channel === "EMAIL" ? customer.emailRemindersAllowed && customer.email === job.destination : customer.smsRemindersAllowed && customer.phone === job.destination);
        const balance = customer?.sales.reduce((total, sale) => {
          const paid = sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
          const credits = sale.returns.reduce((sum, entry) => sum + Number(entry.total), 0);
          return total + Math.max(0, Number(sale.total) - paid - credits);
        }, 0) ?? 0;
        if (!stillConsented || balance <= 0) {
          await prisma.notificationDelivery.update({ where: { id: job.id }, data: { status: "SUPPRESSED", lastError: !stillConsented ? "Suppressed because consent was withdrawn or the destination changed." : "Suppressed because the balance was settled before delivery." } });
          continue;
        }
        await prisma.notification.update({ where: { id: job.notificationId }, data: { message: `Hello ${customer.name}, your current outstanding balance is ${balance.toLocaleString("en-NG", { maximumFractionDigits: 2 })}. Please contact us if you have already made payment.` } });
      }
      let providerMessageId: string | undefined;
      if (job.channel === "EMAIL") {
        const key = process.env.RESEND_API_KEY;
        const from = process.env.REMINDER_FROM_EMAIL;
        if (!key || !from) throw new Error("Resend is not configured (RESEND_API_KEY and REMINDER_FROM_EMAIL are required).");
        const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": job.id }, body: JSON.stringify({ from, to: [job.destination], subject: job.notification.title, text: job.notification.message, html: `<p>${escapeHtml(job.notification.message)}</p>` }), signal: AbortSignal.timeout(15_000) });
        const body = await result.json().catch(() => null) as { id?: string; message?: string } | null;
        if (!result.ok || !body?.id) throw new Error(body?.message || `Resend returned HTTP ${result.status}.`);
        providerMessageId = body.id;
      } else {
        const key = process.env.TERMII_API_KEY;
        const sender = process.env.TERMII_SENDER_ID;
        if (!key || !sender) throw new Error("Termii is not configured (TERMII_API_KEY and TERMII_SENDER_ID are required).");
        const result = await fetch(process.env.TERMII_API_URL || "https://api.ng.termii.com/api/sms/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ api_key: key, to: job.destination, from: sender, sms: job.notification.message, type: "plain", channel: "generic" }), signal: AbortSignal.timeout(15_000) });
        const body = await result.json().catch(() => null) as { message_id?: string; message?: string } | null;
        if (!result.ok || !body?.message_id) throw new Error(body?.message || `Termii returned HTTP ${result.status}.`);
        providerMessageId = body.message_id;
      }
      await prisma.notificationDelivery.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), providerMessageId, lastError: null } });
    } catch (error) {
      const attempts = job.attempts + 1;
      await prisma.notificationDelivery.update({ where: { id: job.id }, data: { status: attempts >= 5 ? "FAILED" : "PENDING", nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000), lastError: safeFailureMessage(error) } });
    }
  }
}

async function dispatchEmailOutbox() {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 5 * 60_000);
  const jobs = await prisma.emailOutbox.findMany({ where: { OR: [{ status: "PENDING", nextAttemptAt: { lte: now } }, { status: "PROCESSING", updatedAt: { lte: staleBefore } }] }, orderBy: { createdAt: "asc" }, take: 30 });
  for (const job of jobs) {
    const claimed = await prisma.emailOutbox.updateMany({ where: { id: job.id, status: job.status, ...(job.status === "PROCESSING" ? { updatedAt: { lte: staleBefore } } : { nextAttemptAt: { lte: now } }) }, data: { status: "PROCESSING", attempts: { increment: 1 } } });
    if (!claimed.count) continue;
    try {
      const key = process.env.RESEND_API_KEY;
      const from = process.env.REMINDER_FROM_EMAIL;
      if (!key || !from) throw new Error("Resend is not configured (RESEND_API_KEY and REMINDER_FROM_EMAIL are required).");
      const result = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": job.id }, body: JSON.stringify({ from, to: [job.destination], subject: job.subject, text: job.text, html: job.html }), signal: AbortSignal.timeout(15_000) });
      const body = await result.json().catch(() => null) as { id?: string; message?: string } | null;
      if (!result.ok || !body?.id) throw new Error(body?.message || `Resend returned HTTP ${result.status}.`);
      // The payload contains a live one-time token. Remove it once the provider accepts the message.
      await prisma.emailOutbox.update({ where: { id: job.id }, data: { status: "SENT", sentAt: new Date(), subject: "", text: "", html: "", lastError: null } });
    } catch (error) {
      const attempts = job.attempts + 1;
      const failed = attempts >= 5;
      await prisma.emailOutbox.update({ where: { id: job.id }, data: { status: failed ? "FAILED" : "PENDING", nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000), lastError: safeFailureMessage(error), ...(failed ? { subject: "", text: "", html: "" } : {}) } });
    }
  }
}

async function releaseExpiredReservations() {
  const now = new Date();
  const expired = await prisma.onlineOrder.findMany({ where: { status: "PENDING_PAYMENT", expiresAt: { lte: now } }, include: { reservations: { where: { status: "ACTIVE" } }, payments: { where: { status: "PENDING" } } }, take: 100 });
  for (const order of expired) {
    await prisma.$transaction(async (transaction) => {
      const live = await transaction.onlineOrder.findUnique({ where: { id: order.id }, include: { reservations: { where: { status: "ACTIVE" } }, payments: { where: { status: "PENDING" } } } });
      if (!live || live.status !== "PENDING_PAYMENT" || !live.expiresAt || live.expiresAt > now) return;
      for (const reservation of live.reservations) {
        const changed = await transaction.stockBalance.updateMany({ where: { productId: reservation.productId, branchId: reservation.branchId, reserved: { gte: reservation.quantity } }, data: { reserved: { decrement: reservation.quantity } } });
        if (changed.count !== 1) throw new Error(`Reservation balance invariant failed for ${reservation.id}`);
        await transaction.stockReservation.update({ where: { id: reservation.id }, data: { status: "EXPIRED" } });
      }
      await transaction.payment.updateMany({ where: { id: { in: live.payments.map((payment) => payment.id) }, status: "PENDING" }, data: { status: "FAILED" } });
      await transaction.onlineOrder.update({ where: { id: live.id }, data: { status: "CANCELLED" } });
      await transaction.notification.upsert({ where: { dedupeKey: `ORDER-EXPIRED:${live.id}` }, create: { businessId: live.businessId, type: "ONLINE_ORDER", severity: "INFO", title: "Unpaid order expired", message: `Order ${live.number} expired and its stock reservation was released.`, entityType: "OnlineOrder", entityId: live.id, dedupeKey: `ORDER-EXPIRED:${live.id}` }, update: { readAt: null, createdAt: now } });
      await writeAudit(transaction, { businessId: live.businessId, action: "ONLINE_RESERVATION_EXPIRED", entityType: "OnlineOrder", entityId: live.id, after: { status: "CANCELLED" } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }
}

async function refreshLowStockAlerts() {
  const balances = await prisma.stockBalance.findMany({ where: { product: { state: "ACTIVE" } }, include: { product: { select: { id: true, businessId: true, name: true, reorderLevel: true } }, branch: { select: { id: true, name: true, businessId: true } } }, take: 2000 });
  const alertKeys = balances.map((balance) => `LOW-STOCK:${balance.branchId}:${balance.productId}`);
  const existingAlerts = await prisma.notification.findMany({ where: { dedupeKey: { in: alertKeys } }, select: { dedupeKey: true, title: true } });
  const existingTitles = new Map(existingAlerts.flatMap((alert) => alert.dedupeKey ? [[alert.dedupeKey, alert.title] as const] : []));
  const businessIds = [...new Set(balances.map((balance) => balance.product.businessId))];
  const businesses = await prisma.business.findMany({
    where: { id: { in: businessIds } },
    select: { id: true, timezone: true, users: { where: { role: "OWNER", isActive: true }, select: { id: true } } },
  });
  const businessMap = new Map(businesses.map((business) => [business.id, business]));
  const now = new Date();
  for (const balance of balances) {
    const available = Number(balance.onHand) - Number(balance.reserved);
    const key = `LOW-STOCK:${balance.branchId}:${balance.productId}`;
    if (available > Number(balance.product.reorderLevel)) {
      await prisma.notification.updateMany({ where: { dedupeKey: key }, data: { readAt: now, title: "Stock recovered", message: `${balance.product.name} stock recovered at ${balance.branch.name}.` } });
      await prisma.notification.updateMany({ where: { businessId: balance.product.businessId, entityType: "Product", entityId: balance.productId, dedupeKey: { startsWith: `OUT-OF-STOCK-REMINDER:${balance.branchId}:` }, readAt: null }, data: { readAt: now, message: `${balance.product.name} stock recovered at ${balance.branch.name}.` } });
      continue;
    }
    const title = available <= 0 ? "Out of stock" : "Low stock";
    await prisma.notification.upsert({ where: { dedupeKey: key }, create: { businessId: balance.product.businessId, type: "INVENTORY", severity: available <= 0 ? "CRITICAL" : "WARNING", title, message: `${balance.product.name} has ${available} available units at ${balance.branch.name}.`, entityType: "Product", entityId: balance.productId, dedupeKey: key }, update: { severity: available <= 0 ? "CRITICAL" : "WARNING", title, message: `${balance.product.name} has ${available} available units at ${balance.branch.name}.`, ...(existingTitles.get(key) !== title ? { readAt: null, createdAt: now } : {}) } });

    if (available < 1) {
      const business = businessMap.get(balance.product.businessId);
      if (!business || !business.users.length) continue;
      const clock = localClock(now, business.timezone);
      const reminderScope = `${business.id}:${balance.branchId}:${balance.productId}`;
      if (clock.hour < 8 || dailyOutOfStockReminders.get(reminderScope) === clock.date) continue;
      for (const owner of business.users) {
        const reminderKey = `OUT-OF-STOCK-REMINDER:${balance.branchId}:${balance.productId}:${clock.date}:${owner.id}`;
        await prisma.notification.upsert({
          where: { dedupeKey: reminderKey },
          create: { businessId: balance.product.businessId, userId: owner.id, type: "INVENTORY", severity: "CRITICAL", title: "Out-of-stock reminder", message: `${balance.product.name} is still out of stock at ${balance.branch.name}. Available quantity: ${available}. Please restock or review this item.`, entityType: "Product", entityId: balance.productId, dedupeKey: reminderKey },
          update: {},
        });
      }
      dailyOutOfStockReminders.set(reminderScope, clock.date);
    }
  }
}

async function refreshExpiryAlerts() {
  const now = new Date();
  const alertThrough = new Date(now.getTime() + 30 * 86_400_000);
  const batches = await prisma.goodsReceiptLine.findMany({ where: { expiresAt: { lte: alertThrough }, acceptedQuantity: { gt: 0 }, product: { state: "ACTIVE" } }, include: { product: { select: { name: true, sku: true } }, goodsReceipt: { select: { branchId: true, purchaseOrder: { select: { businessId: true } } } } }, take: 1000 });
  for (const batch of batches) {
    if (!batch.expiresAt) continue;
    const expired = batch.expiresAt < now;
    const key = `EXPIRY:${batch.id}`;
    await prisma.notification.upsert({ where: { dedupeKey: key }, create: { businessId: batch.goodsReceipt.purchaseOrder.businessId, type: "INVENTORY", severity: expired ? "CRITICAL" : "WARNING", title: expired ? "Expired batch on record" : "Stock approaching expiry", message: `${batch.product.name} (${batch.product.sku}) batch ${batch.batchNumber ?? batch.id} has ${Number(batch.acceptedQuantity)} received units and expires ${batch.expiresAt.toISOString().slice(0, 10)}. Review the batch before sale.`, entityType: "GoodsReceiptLine", entityId: batch.id, dedupeKey: key }, update: { severity: expired ? "CRITICAL" : "WARNING" } });
  }
}

async function refreshOverdueAlerts() {
  const now = new Date();
  const sales = await prisma.sale.findMany({ where: { dueAt: { lt: now }, status: { not: "CANCELLED" }, customerId: { not: null } }, include: { customer: { select: { name: true } }, business: { select: { currency: true } }, payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } } }, take: 1000 });
  for (const sale of sales) {
    const paid = sale.payments.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const credited = sale.returns.reduce((sum, entry) => sum + Number(entry.total), 0);
    const balance = Number(sale.total) - paid - credited;
    if (balance <= 0) continue;
    const key = `RECEIVABLE-OVERDUE:${sale.id}`;
    await prisma.notification.upsert({ where: { dedupeKey: key }, create: { businessId: sale.businessId, type: "CUSTOMER_DEBT", severity: "WARNING", title: "Customer payment overdue", message: `${sale.customer?.name ?? "Customer"} owes ₦${balance.toLocaleString("en-NG")} on sale ${sale.number}.`, entityType: "Sale", entityId: sale.id, dedupeKey: key }, update: { message: `${sale.customer?.name ?? "Customer"} owes ₦${balance.toLocaleString("en-NG")} on sale ${sale.number}.` } });
  }
  const invoices = await prisma.supplierInvoice.findMany({ where: { dueAt: { lt: now } }, include: { supplier: { select: { name: true } }, allocations: { include: { payment: { select: { status: true } } } }, returns: { select: { creditAmount: true } } }, take: 1000 });
  for (const invoice of invoices) {
    const paid = invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((sum, allocation) => sum + Number(allocation.amount), 0);
    const credited = invoice.returns.reduce((sum, entry) => sum + Number(entry.creditAmount), 0);
    const balance = Number(invoice.totalAmount) - paid - credited;
    if (balance <= 0) continue;
    const key = `PAYABLE-OVERDUE:${invoice.id}`;
    await prisma.notification.upsert({ where: { dedupeKey: key }, create: { businessId: invoice.businessId, type: "PURCHASING", severity: "WARNING", title: "Supplier invoice overdue", message: `${invoice.supplier.name} invoice ${invoice.invoiceNumber} has ₦${balance.toLocaleString("en-NG")} outstanding.`, entityType: "SupplierInvoice", entityId: invoice.id, dedupeKey: key }, update: { message: `${invoice.supplier.name} invoice ${invoice.invoiceNumber} has ₦${balance.toLocaleString("en-NG")} outstanding.` } });
  }
}

async function queueDebtReminders() {
  const now = new Date();
  const dueThrough = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const sales = await prisma.sale.findMany({ where: { dueAt: { lte: dueThrough }, customerId: { not: null }, status: { not: "CANCELLED" } }, include: { customer: true, business: { select: { currency: true } }, payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } } }, take: 1000 });
  for (const sale of sales) {
    const customer = sale.customer;
    if (!customer) continue;
    const channels = [
      ...(customer.email && customer.emailRemindersAllowed ? [{ channel: "EMAIL" as const, destination: customer.email, provider: "RESEND" }] : []),
      ...(customer.phone && customer.smsRemindersAllowed ? [{ channel: "SMS" as const, destination: customer.phone, provider: "TERMII" }] : []),
    ];
    if (!channels.length) continue;
    const paid = sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credit = sale.returns.reduce((sum, entry) => sum + Number(entry.total), 0);
    const balance = Math.max(0, Number(sale.total) - paid - credit);
    if (balance <= 0) continue;
    const daysUntilDue = Math.ceil((sale.dueAt!.getTime() - now.getTime()) / 86_400_000);
    const cadence = daysUntilDue > 0 ? "BEFORE_DUE" : daysUntilDue === 0 ? "DUE" : `OVERDUE_${Math.floor(Math.abs(daysUntilDue) / 7)}`;
    const key = `DEBT-REMINDER:${sale.id}:${cadence}`;
    const message = `Hello ${customer.name}, invoice ${sale.number} has an outstanding balance of ${balance.toLocaleString("en-NG", { maximumFractionDigits: 2 })} ${sale.business.currency}. Please contact us if you have already made payment.`;
    await prisma.notification.upsert({
      where: { dedupeKey: key },
      create: { businessId: sale.businessId, type: "CUSTOMER_DEBT", severity: "INFO", title: daysUntilDue < 0 ? "Overdue payment reminder" : "Payment due reminder", message, entityType: "Customer", entityId: customer.id, dedupeKey: key, deliveries: { create: channels } },
      update: {},
    });
  }
}

async function refreshOverdueInstallments() {
  const now = new Date();
  const installments = await prisma.installmentDue.findMany({
    where: { dueAt: { lt: now }, status: { in: ["PENDING", "PARTIALLY_PAID"] }, agreement: { status: "ACTIVE" } },
    include: { agreement: { include: { customer: true, business: { select: { currency: true } } } } },
    take: 1000,
  });
  for (const installment of installments) {
    const outstanding = Math.max(0, Number(installment.amount) - Number(installment.paidAmount));
    if (outstanding <= 0) continue;
    const updated = await prisma.installmentDue.updateMany({ where: { id: installment.id, status: { in: ["PENDING", "PARTIALLY_PAID"] }, dueAt: { lt: now } }, data: { status: "OVERDUE" } });
    if (!updated.count) continue;
    const customer = installment.agreement.customer;
    const channels = [
      ...(customer.email && customer.emailRemindersAllowed ? [{ channel: "EMAIL" as const, destination: customer.email, provider: "RESEND" }] : []),
      ...(customer.phone && customer.smsRemindersAllowed ? [{ channel: "SMS" as const, destination: customer.phone, provider: "TERMII" }] : []),
    ];
    const dueLabel = installment.dueAt.toISOString().slice(0, 10);
    const key = `INSTALLMENT-OVERDUE:${installment.id}:${dueLabel}`;
    const message = `${customer.name} has an overdue payment of ${outstanding.toLocaleString("en-NG")} ${installment.agreement.business.currency} for agreement ${installment.agreement.number}, instalment ${installment.sequence}.`;
    await prisma.notification.upsert({
      where: { dedupeKey: key },
      create: { businessId: installment.agreement.businessId, type: "INSTALLMENT", severity: "WARNING", title: "Instalment payment overdue", message, entityType: "Customer", entityId: customer.id, dedupeKey: key, deliveries: { create: channels } },
      update: { readAt: null, message },
    });
  }
}

async function cleanExpiredAdminSessions() {
  const now = new Date();
  await prisma.refreshToken.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.session.deleteMany({
    where: {
      OR: [
        { revokedAt: { not: null } },
        {
          expiresAt: { lte: now },
          refreshTokens: { none: { expiresAt: { gt: now }, revokedAt: null } },
        },
      ],
    },
  });
}

let sweepInProgress = false;

async function sweep() {
  if (sweepInProgress) {
    console.warn("Skipping worker sweep because the previous sweep is still running.");
    return;
  }

  sweepInProgress = true;
  let currentTask = "cleanExpiredAdminSessions";
  try {
    await cleanExpiredAdminSessions();
    currentTask = "releaseExpiredReservations";
    await releaseExpiredReservations();
    currentTask = "refreshLowStockAlerts";
    await refreshLowStockAlerts();
    currentTask = "refreshExpiryAlerts";
    await refreshExpiryAlerts();
    currentTask = "refreshOverdueAlerts";
    await refreshOverdueAlerts();
    currentTask = "queueDebtReminders";
    await queueDebtReminders();
    currentTask = "refreshOverdueInstallments";
    await refreshOverdueInstallments();
    currentTask = "dispatchDeliveries";
    await dispatchDeliveries();
    currentTask = "dispatchEmailOutbox";
    await dispatchEmailOutbox();
    console.info("Backend notification and reservation sweep completed.");
  } catch (error) {
    console.error("Backend worker sweep failed.", { task: currentTask, ...safeErrorMetadata(error) });
  } finally {
    sweepInProgress = false;
  }
}

void sweep();
const timer = setInterval(() => void sweep(), 60_000);
process.on("SIGINT", async () => { clearInterval(timer); await prisma.$disconnect(); process.exit(0); });
process.on("SIGTERM", async () => { clearInterval(timer); await prisma.$disconnect(); process.exit(0); });
