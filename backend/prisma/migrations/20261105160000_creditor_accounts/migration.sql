CREATE TYPE "CustomerType" AS ENUM ('PERSONAL', 'COMPANY');
ALTER TABLE "Customer"
  ADD COLUMN "type" "CustomerType" NOT NULL DEFAULT 'PERSONAL',
  ADD COLUMN "companyName" VARCHAR(180),
  ADD COLUMN "contactPerson" VARCHAR(180),
  ADD COLUMN "isCreditor" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Sale" ADD COLUMN "creditReference" VARCHAR(100);
CREATE INDEX "Customer_businessId_isCreditor_idx" ON "Customer"("businessId", "isCreditor");
