import { Prisma } from "@prisma/client";
import { ApiError } from "./errors.js";

type Transaction = Prisma.TransactionClient;
type Allocation = { stockLotId: string; quantity: Prisma.Decimal; unitCost: Prisma.Decimal };

/** Allocate oldest non-expired lots first; undated stock is consumed after dated stock. */
export async function takeFefoLots(
  transaction: Transaction,
  input: { productId: string; branchId: string; quantity: number | Prisma.Decimal; now?: Date; includeExpired?: boolean },
): Promise<Allocation[]> {
  let remaining = new Prisma.Decimal(input.quantity);
  const now = input.now ?? new Date();
  const lots = await transaction.stockLot.findMany({
    where: { productId: input.productId, branchId: input.branchId, ...(input.includeExpired ? {} : { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }) },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  const allocations: Allocation[] = [];
  for (const lot of lots) {
    if (remaining.isZero()) break;
    const available = lot.quantity.minus(lot.reserved);
    if (available.lessThanOrEqualTo(0)) continue;
    const quantity = Prisma.Decimal.min(remaining, available);
    const changed = await transaction.stockLot.updateMany({
      where: { id: lot.id, quantity: lot.quantity, reserved: lot.reserved },
      data: { quantity: { decrement: quantity } },
    });
    if (changed.count !== 1) throw new ApiError(409, "Batch stock changed during checkout. Retry the operation.", "STOCK_LOT_CONFLICT");
    allocations.push({ stockLotId: lot.id, quantity, unitCost: lot.unitCost });
    remaining = remaining.minus(quantity);
  }
  if (remaining.greaterThan(0)) throw new ApiError(409, "There is not enough unexpired, unreserved batch stock.", "INSUFFICIENT_BATCH_STOCK", { productId: input.productId, shortfall: remaining.toString() });
  return allocations;
}

export async function reserveFefoLots(
  transaction: Transaction,
  input: { reservationId: string; productId: string; branchId: string; quantity: number | Prisma.Decimal; now?: Date },
) {
  let remaining = new Prisma.Decimal(input.quantity);
  const now = input.now ?? new Date();
  const lots = await transaction.stockLot.findMany({
    where: { productId: input.productId, branchId: input.branchId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    orderBy: [{ expiresAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  for (const lot of lots) {
    if (remaining.isZero()) break;
    const available = lot.quantity.minus(lot.reserved);
    if (available.lessThanOrEqualTo(0)) continue;
    const quantity = Prisma.Decimal.min(remaining, available);
    const changed = await transaction.stockLot.updateMany({ where: { id: lot.id, quantity: lot.quantity, reserved: lot.reserved }, data: { reserved: { increment: quantity } } });
    if (changed.count !== 1) throw new ApiError(409, "Batch reservation changed during checkout. Retry the operation.", "STOCK_LOT_CONFLICT");
    await transaction.reservationLot.create({ data: { reservationId: input.reservationId, stockLotId: lot.id, quantity } });
    remaining = remaining.minus(quantity);
  }
  if (remaining.greaterThan(0)) throw new ApiError(409, "There is not enough unexpired, unreserved batch stock.", "INSUFFICIENT_BATCH_STOCK", { productId: input.productId, shortfall: remaining.toString() });
}

export async function consumeReservedLots(transaction: Transaction, reservationId: string) {
  const lots = await transaction.reservationLot.findMany({ where: { reservationId }, include: { stockLot: true } });
  return lots.map(({ stockLot, quantity }) => {
    if (stockLot.quantity.lessThan(quantity) || stockLot.reserved.lessThan(quantity)) throw new ApiError(409, "Reserved batch stock is no longer available.", "RESERVATION_INVALID");
    return { stockLotId: stockLot.id, quantity, unitCost: stockLot.unitCost };
  });
}

export async function releaseReservedLots(transaction: Transaction, reservationId: string) {
  const lots = await transaction.reservationLot.findMany({ where: { reservationId } });
  for (const lot of lots) {
    const changed = await transaction.stockLot.updateMany({ where: { id: lot.stockLotId, reserved: { gte: lot.quantity } }, data: { reserved: { decrement: lot.quantity } } });
    if (changed.count !== 1) throw new ApiError(409, "Reserved batch stock could not be released safely.", "RESERVATION_INVALID");
  }
}

