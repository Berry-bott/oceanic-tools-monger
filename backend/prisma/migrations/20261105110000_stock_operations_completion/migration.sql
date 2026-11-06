CREATE TYPE "StockCondition" AS ENUM ('GOOD', 'DAMAGED', 'QUARANTINED', 'EXPIRED');

ALTER TABLE "StockLot"
ADD COLUMN "condition" "StockCondition" NOT NULL DEFAULT 'GOOD';

ALTER TABLE "StockTransfer"
ADD COLUMN "receivedById" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "expectedArrivalAt" TIMESTAMP(3);

ALTER TABLE "StockTransferLine"
ADD COLUMN "receivedQuantity" DECIMAL(14,3),
ADD COLUMN "discrepancyReason" TEXT;

ALTER TABLE "StockCount"
ADD COLUMN "postedById" TEXT;

ALTER TABLE "StockTransfer"
ADD CONSTRAINT "StockTransfer_receivedById_fkey"
FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockCount"
ADD CONSTRAINT "StockCount_postedById_fkey"
FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
