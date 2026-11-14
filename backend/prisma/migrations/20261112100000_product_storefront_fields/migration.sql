ALTER TABLE "Product"
  ADD COLUMN "originalPrice" DECIMAL(14, 2),
  ADD COLUMN "badge" VARCHAR(30),
  ADD COLUMN "averageRating" DECIMAL(2, 1),
  ADD COLUMN "reviewCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Product"
SET "originalPrice" = 29000,
    "badge" = 'POPULAR',
    "averageRating" = 4.7,
    "reviewCount" = 110
WHERE "sku" = 'NL-01'
  AND "originalPrice" IS NULL
  AND "averageRating" IS NULL
  AND "reviewCount" = 0;

INSERT INTO "ProductSpecification" ("id", "productId", "name", "value", "position", "updatedAt")
SELECT md5(product."id" || ':size-package'), product."id", 'Size / Package', 'Box (5,000 pcs)',
       COALESCE((SELECT MAX(specification."position") + 1 FROM "ProductSpecification" specification WHERE specification."productId" = product."id"), 0),
       CURRENT_TIMESTAMP
FROM "Product" product
WHERE product."sku" = 'NL-01'
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSpecification" specification
    WHERE specification."productId" = product."id"
      AND lower(specification."name") = lower('Size / Package')
  );

INSERT INTO "ProductSpecification" ("id", "productId", "name", "value", "position", "updatedAt")
SELECT md5(product."id" || ':duty-rating'), product."id", 'Duty Rating', 'Heavy Industrial Duty',
       COALESCE((SELECT MAX(specification."position") + 1 FROM "ProductSpecification" specification WHERE specification."productId" = product."id"), 0),
       CURRENT_TIMESTAMP
FROM "Product" product
WHERE product."sku" = 'NL-01'
  AND NOT EXISTS (
    SELECT 1 FROM "ProductSpecification" specification
    WHERE specification."productId" = product."id"
      AND lower(specification."name") = lower('Duty Rating')
  );
