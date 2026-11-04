ALTER TABLE "User" ADD COLUMN "branchId" TEXT;
ALTER TABLE "Product" ADD COLUMN "brand" VARCHAR(120);
ALTER TABLE "Product" ADD COLUMN "model" VARCHAR(120);
ALTER TABLE "ProductImage" ADD COLUMN "isPrimary" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE "ProductSpecification" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "value" VARCHAR(500) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductSpecification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductSpecification_productId_position_key" ON "ProductSpecification"("productId", "position");
CREATE INDEX "ProductSpecification_productId_idx" ON "ProductSpecification"("productId");
ALTER TABLE "ProductSpecification" ADD CONSTRAINT "ProductSpecification_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "User_branchId_idx" ON "User"("branchId");

-- Keep existing staff in the business's main branch when one is configured.
UPDATE "User" u
SET "branchId" = b."id"
FROM "Branch" b
WHERE u."role" = 'STAFF' AND b."businessId" = u."businessId" AND b."isDefault" = TRUE;

-- The original front photo remains the default main image.
UPDATE "ProductImage" SET "isPrimary" = TRUE WHERE "view" = 'FRONT' AND "position" = 0;
