import type { Prisma } from "@prisma/client";

export type AuditRecord = {
  businessId: string;
  userId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string;
};

export async function writeAudit(transaction: Prisma.TransactionClient, record: AuditRecord) {
  return transaction.auditLog.create({ data: record });
}
