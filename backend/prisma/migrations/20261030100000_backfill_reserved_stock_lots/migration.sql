-- Preserve links for reservations that existed before lot-level reservations.
INSERT INTO "ReservationLot" ("id", "reservationId", "stockLotId", "quantity")
SELECT 'legacy_reservation_lot_' || md5(r."id" || ':' || lot."id"), r."id", lot."id", r."quantity"
FROM "StockReservation" r
JOIN "StockLot" lot ON lot."productId" = r."productId" AND lot."branchId" = r."branchId"
WHERE r."status" = 'ACTIVE'
  AND lot."origin" = 'OPENING'
  AND lot."id" LIKE 'legacy_lot_%';
