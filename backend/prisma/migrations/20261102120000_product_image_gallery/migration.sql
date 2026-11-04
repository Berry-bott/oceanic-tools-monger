CREATE TYPE "ProductImageView" AS ENUM ('FRONT', 'BACK', 'SIDE', 'ADDITIONAL');

CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "view" "ProductImageView" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductImage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductImage_mediaAssetId_key" ON "ProductImage"("mediaAssetId");
CREATE UNIQUE INDEX "ProductImage_productId_view_position_key" ON "ProductImage"("productId", "view", "position");
CREATE INDEX "ProductImage_productId_view_position_idx" ON "ProductImage"("productId", "view", "position");

ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductImage" ADD CONSTRAINT "ProductImage_mediaAssetId_fkey"
  FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ProductImage" ("id", "productId", "mediaAssetId", "view", "position", "updatedAt")
SELECT md5(random()::text || clock_timestamp()::text), p."id", m."id", 'FRONT', 0, CURRENT_TIMESTAMP
FROM "Product" p
JOIN "MediaAsset" m ON m."productId" = p."id" AND m."publicId" = p."imagePublicId"
WHERE p."imagePublicId" IS NOT NULL AND m."purpose" = 'PRODUCT_IMAGE' AND m."status" = 'ACTIVE'
ON CONFLICT ("mediaAssetId") DO NOTHING;

