CREATE TYPE "SaleReturnStatus" AS ENUM ('REQUESTED', 'REJECTED', 'COMPLETED');

ALTER TABLE "SaleReturn"
  ALTER COLUMN "userId" DROP NOT NULL,
  ADD COLUMN "customerId" TEXT,
  ADD COLUMN "status" "SaleReturnStatus" NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN "resolutionNote" TEXT;

ALTER TABLE "SaleReturn"
  ADD CONSTRAINT "SaleReturn_customerId_fkey"
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "SaleReturn_customerId_createdAt_idx" ON "SaleReturn"("customerId", "createdAt");
CREATE INDEX "SaleReturn_status_createdAt_idx" ON "SaleReturn"("status", "createdAt");
