ALTER TABLE "Product" ADD COLUMN "bottomPrice" DECIMAL(14,2) NOT NULL DEFAULT 0;

UPDATE "Product" SET "bottomPrice" = "costPrice";
