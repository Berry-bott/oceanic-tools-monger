import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { ApiError } from "./errors.js";

export const defaultAccounts = [
  { code: "1000", name: "Cash on hand", type: "ASSET" },
  { code: "1010", name: "Bank", type: "ASSET" },
  { code: "1020", name: "Payment gateway clearing", type: "ASSET" },
  { code: "1100", name: "Accounts receivable", type: "ASSET" },
  { code: "1200", name: "Inventory", type: "ASSET" },
  { code: "2000", name: "Accounts payable", type: "LIABILITY" },
  { code: "2050", name: "Goods received not invoiced", type: "LIABILITY" },
  { code: "2100", name: "Tax payable", type: "LIABILITY" },
  { code: "2200", name: "Customer refunds payable", type: "LIABILITY" },
  { code: "2300", name: "Customer instalments received", type: "LIABILITY" },
  { code: "3000", name: "Owner equity / opening balances", type: "EQUITY" },
  { code: "4000", name: "Sales revenue", type: "REVENUE" },
  { code: "4200", name: "Delivery revenue", type: "REVENUE" },
  { code: "4100", name: "Sales returns and discounts", type: "CONTRA_REVENUE" },
  { code: "4900", name: "Inventory adjustment gains", type: "OTHER_INCOME" },
  { code: "5000", name: "Cost of goods sold", type: "EXPENSE" },
  { code: "5100", name: "Purchase price variance", type: "EXPENSE" },
  { code: "6000", name: "Operating expenses", type: "EXPENSE" },
  { code: "6200", name: "Payment gateway fees", type: "EXPENSE" },
];

export type LedgerLine = { code: string; debit?: number | Prisma.Decimal; credit?: number | Prisma.Decimal; description?: string };

export async function postLedgerEntry(transaction: PrismaTypes.TransactionClient, input: {
  businessId: string;
  userId?: string | null;
  sourceType: string;
  sourceId: string;
  description: string;
  postingDate?: Date;
  lines: LedgerLine[];
}) {
  const lines = input.lines.filter((line) => Number(line.debit ?? 0) > 0 || Number(line.credit ?? 0) > 0);
  const debit = lines.reduce((sum, line) => sum.add(new Prisma.Decimal(line.debit ?? 0)), new Prisma.Decimal(0));
  const credit = lines.reduce((sum, line) => sum.add(new Prisma.Decimal(line.credit ?? 0)), new Prisma.Decimal(0));
  if (lines.length < 2 || !debit.equals(credit)) throw new ApiError(500, "Ledger transaction is unbalanced.", "UNBALANCED_LEDGER_ENTRY", { debit: debit.toString(), credit: credit.toString() });
  const codes = [...new Set(lines.map((line) => line.code))];
  const accounts = await transaction.account.findMany({ where: { businessId: input.businessId, code: { in: codes }, isActive: true }, select: { id: true, code: true } });
  const byCode = new Map(accounts.map((account) => [account.code, account.id]));
  if (byCode.size !== codes.length) throw new ApiError(409, "A required accounting account is missing or inactive.", "ACCOUNT_NOT_CONFIGURED", { missing: codes.filter((code) => !byCode.has(code)) });
  const entry = await transaction.journalEntry.create({
    data: {
      businessId: input.businessId,
      createdById: input.userId ?? (await transaction.user.findFirstOrThrow({ where: { businessId: input.businessId, role: "OWNER" }, select: { id: true } })).id,
      reference: `JRN-${randomUUID().slice(0, 12).toUpperCase()}`,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      description: input.description,
      status: "POSTED",
      postingDate: input.postingDate ?? new Date(),
      postedAt: new Date(),
      lines: { create: lines.map((line) => ({ accountId: byCode.get(line.code)!, debit: new Prisma.Decimal(line.debit ?? 0), credit: new Prisma.Decimal(line.credit ?? 0), description: line.description })) },
    },
  });
  return entry;
}
