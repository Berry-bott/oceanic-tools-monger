CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "productId" TEXT,
    "ownerId" VARCHAR(255),
    "purpose" VARCHAR(40) NOT NULL,
    "resourceType" VARCHAR(10) NOT NULL,
    "folder" VARCHAR(255) NOT NULL,
    "secureUrl" TEXT,
    "publicId" VARCHAR(255) NOT NULL,
    "originalFilename" VARCHAR(255),
    "mimeType" VARCHAR(120),
    "status" VARCHAR(20) NOT NULL DEFAULT 'UPLOADING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MediaAsset_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MediaAsset_publicId_key" ON "MediaAsset"("publicId");
CREATE INDEX "MediaAsset_businessId_purpose_status_idx" ON "MediaAsset"("businessId", "purpose", "status");
CREATE INDEX "MediaAsset_productId_status_idx" ON "MediaAsset"("productId", "status");

INSERT INTO "MediaAsset" ("id", "businessId", "productId", "purpose", "resourceType", "folder", "secureUrl", "publicId", "status", "createdAt", "updatedAt")
SELECT 'legacy_' || p."id", p."businessId", p."id", 'PRODUCT_IMAGE', 'image', 'products/images', p."imageUrl", p."imagePublicId", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."imagePublicId" IS NOT NULL;
