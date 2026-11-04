CREATE TABLE IF NOT EXISTS "Category" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "Subcategory" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "normalizedName" VARCHAR(100) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategory" VARCHAR(100);
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "subcategoryId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Category_businessId_normalizedName_key" ON "Category"("businessId", "normalizedName");
CREATE INDEX IF NOT EXISTS "Category_businessId_name_idx" ON "Category"("businessId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "Subcategory_categoryId_normalizedName_key" ON "Subcategory"("categoryId", "normalizedName");
CREATE INDEX IF NOT EXISTS "Subcategory_categoryId_name_idx" ON "Subcategory"("categoryId", "name");
CREATE INDEX IF NOT EXISTS "Product_categoryId_idx" ON "Product"("categoryId");
CREATE INDEX IF NOT EXISTS "Product_subcategoryId_idx" ON "Product"("subcategoryId");

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Category_businessId_fkey' AND conrelid = '"Category"'::regclass) THEN
        ALTER TABLE "Category" ADD CONSTRAINT "Category_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Subcategory_categoryId_fkey' AND conrelid = '"Subcategory"'::regclass) THEN
        ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_categoryId_fkey' AND conrelid = '"Product"'::regclass) THEN
        ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Product_subcategoryId_fkey' AND conrelid = '"Product"'::regclass) THEN
        ALTER TABLE "Product" ADD CONSTRAINT "Product_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

INSERT INTO "Category" ("id", "businessId", "name", "normalizedName")
SELECT
    md5(random()::text || clock_timestamp()::text || p."businessId" || lower(regexp_replace(trim(p.category), '\s+', ' ', 'g'))),
    p."businessId",
    min(trim(p.category)),
    lower(regexp_replace(trim(p.category), '\s+', ' ', 'g'))
FROM "Product" p
GROUP BY p."businessId", lower(regexp_replace(trim(p.category), '\s+', ' ', 'g'))
ON CONFLICT ("businessId", "normalizedName") DO NOTHING;

UPDATE "Product" p SET "categoryId" = c.id
FROM "Category" c
WHERE c."businessId" = p."businessId"
  AND c."normalizedName" = lower(regexp_replace(trim(p.category), '\s+', ' ', 'g'))
  AND p."categoryId" IS NULL;
