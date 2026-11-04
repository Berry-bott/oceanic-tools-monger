import { Router } from "express";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const notificationsRouter = Router();
export const auditRouter = Router();
notificationsRouter.use(requireAuth);
auditRouter.use(requireAuth, requireRoles("OWNER"));

notificationsRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const unreadOnly = request.query.unread === "true";
  const data = await prisma.notification.findMany({ where: { businessId: auth.businessId, OR: [{ userId: null }, { userId: auth.userId }], ...(unreadOnly ? { readAt: null } : {}) }, orderBy: { createdAt: "desc" }, take: 100 });
  response.json({ data, unreadCount: await prisma.notification.count({ where: { businessId: auth.businessId, OR: [{ userId: null }, { userId: auth.userId }], readAt: null } }) });
});

notificationsRouter.post("/:notificationId/read", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const notification = await prisma.notification.findFirst({ where: { id: request.params.notificationId as string, businessId: auth.businessId, OR: [{ userId: null }, { userId: auth.userId }] } });
  if (!notification) throw new ApiError(404, "Notification not found.", "NOTIFICATION_NOT_FOUND");
  const updated = await prisma.notification.update({ where: { id: notification.id }, data: { readAt: notification.readAt ?? new Date() } });
  response.json({ data: updated });
});

notificationsRouter.post("/deliveries/:deliveryId/retry", requireRoles("OWNER", "STAFF"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const delivery = await prisma.notificationDelivery.findFirst({ where: { id: request.params.deliveryId as string, notification: { businessId: auth.businessId } } });
  if (!delivery) throw new ApiError(404, "Notification delivery not found.", "DELIVERY_NOT_FOUND");
  if (delivery.status !== "FAILED") throw new ApiError(409, "Only failed deliveries can be retried.", "DELIVERY_NOT_FAILED");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.notificationDelivery.update({ where: { id: delivery.id }, data: { status: "PENDING", attempts: 0, nextAttemptAt: new Date(), lastError: null } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "NOTIFICATION_DELIVERY_RETRY_QUEUED", entityType: "NotificationDelivery", entityId: delivery.id, before: { status: delivery.status }, after: { status: result.status, channel: result.channel } });
    return result;
  });
  response.status(202).json({ data: updated });
});

auditRouter.get("/", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const data = await prisma.auditLog.findMany({ where: { businessId: auth.businessId, ...(typeof request.query.entityType === "string" ? { entityType: request.query.entityType } : {}), ...(typeof request.query.entityId === "string" ? { entityId: request.query.entityId } : {}) }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  response.json({ data });
});

auditRouter.post("/acknowledge/:entityType/:entityId", requireRoles("OWNER"), async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const notification = await prisma.notification.findFirst({ where: { businessId: auth.businessId, entityType: request.params.entityType as string, entityId: request.params.entityId as string, OR: [{ userId: null }, { userId: auth.userId }] } });
  if (!notification) throw new ApiError(404, "Actionable notification not found.", "NOTIFICATION_NOT_FOUND");
  const updated = await prisma.$transaction(async (transaction) => {
    const result = await transaction.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    await writeAudit(transaction, { businessId: auth.businessId, userId: auth.userId, action: "NOTIFICATION_ACKNOWLEDGED", entityType: notification.entityType ?? "Notification", entityId: notification.entityId ?? notification.id, after: { notificationId: notification.id } });
    return result;
  });
  response.json({ data: updated });
});
