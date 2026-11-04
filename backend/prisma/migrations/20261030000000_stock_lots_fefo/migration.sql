CREATE TABLE "StockLot" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "sourceReceiptLineId" TEXT,
    "batchNumber" VARCHAR(100),
    "expiresAt" TIMESTAMP(3),
    "unitCost" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "origin" VARCHAR(30) NOT NULL DEFAULT 'OPENING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SaleLotAllocation" (
    "id" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "stockLotId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "SaleLotAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReturnLotAllocation" (
    "id" TEXT NOT NULL,
    "saleReturnLineId" TEXT NOT NULL,
    "stockLotId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,2) NOT NULL,
    CONSTRAINT "ReturnLotAllocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservationLot" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "stockLotId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    CONSTRAINT "ReservationLot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StockTransferLot" (
    "id" TEXT NOT NULL,
    "transferLineId" TEXT NOT NULL,
    "batchNumber" VARCHAR(100),
    "expiresAt" TIMESTAMP(3),
    "unitCost" DECIMAL(14,2) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    CONSTRAINT "StockTransferLot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockLot_sourceReceiptLineId_key" ON "StockLot"("sourceReceiptLineId");
CREATE INDEX "StockLot_productId_branchId_expiresAt_createdAt_idx" ON "StockLot"("productId", "branchId", "expiresAt", "createdAt");
CREATE INDEX "SaleLotAllocation_saleLineId_idx" ON "SaleLotAllocation"("saleLineId");
CREATE INDEX "SaleLotAllocation_stockLotId_idx" ON "SaleLotAllocation"("stockLotId");
CREATE INDEX "ReturnLotAllocation_saleReturnLineId_idx" ON "ReturnLotAllocation"("saleReturnLineId");
CREATE UNIQUE INDEX "ReservationLot_reservationId_stockLotId_key" ON "ReservationLot"("reservationId", "stockLotId");
CREATE INDEX "ReservationLot_stockLotId_idx" ON "ReservationLot"("stockLotId");
CREATE INDEX "StockTransferLot_transferLineId_idx" ON "StockTransferLot"("transferLineId");

ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockLot" ADD CONSTRAINT "StockLot_sourceReceiptLineId_fkey" FOREIGN KEY ("sourceReceiptLineId") REFERENCES "GoodsReceiptLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLotAllocation" ADD CONSTRAINT "SaleLotAllocation_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleLotAllocation" ADD CONSTRAINT "SaleLotAllocation_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnLotAllocation" ADD CONSTRAINT "ReturnLotAllocation_saleReturnLineId_fkey" FOREIGN KEY ("saleReturnLineId") REFERENCES "SaleReturnLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnLotAllocation" ADD CONSTRAINT "ReturnLotAllocation_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationLot" ADD CONSTRAINT "ReservationLot_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "StockReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationLot" ADD CONSTRAINT "ReservationLot_stockLotId_fkey" FOREIGN KEY ("stockLotId") REFERENCES "StockLot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockTransferLot" ADD CONSTRAINT "StockTransferLot_transferLineId_fkey" FOREIGN KEY ("transferLineId") REFERENCES "StockTransferLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing stock predates batch tracking. Preserve it as undated opening inventory.
INSERT INTO "StockLot" ("id", "productId", "branchId", "unitCost", "quantity", "reserved", "origin")
SELECT 'legacy_lot_' || md5(sb."productId" || ':' || sb."branchId"), sb."productId", sb."branchId", p."costPrice", sb."onHand", sb."reserved", 'OPENING'
FROM "StockBalance" sb JOIN "Product" p ON p."id" = sb."productId"
WHERE sb."onHand" > 0;

