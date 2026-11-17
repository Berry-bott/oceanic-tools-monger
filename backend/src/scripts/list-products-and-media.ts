import "dotenv/config";
import { prisma } from "../lib/prisma.js";

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      state: true,
      isPublished: true,
      productImages: {
        select: {
          id: true,
          position: true,
          mediaAsset: {
            select: {
              id: true,
              publicId: true,
              secureUrl: true,
            },
          },
        },
      },
    },
  });

  console.log("=== DB PRODUCTS (" + products.length + ") ===");
  for (const p of products) {
    console.log(`[${p.sku}] ${p.name} (Images: ${p.productImages.length})`);
    for (const img of p.productImages) {
      console.log(`   - MediaAsset ID: ${img.mediaAsset?.id}, URL: ${img.mediaAsset?.secureUrl}`);
    }
  }

  const allMedia = await prisma.mediaAsset.findMany();
  console.log("\n=== ALL MEDIA ASSETS (" + allMedia.length + ") ===");
  for (const m of allMedia) {
    console.log(`ID: ${m.id} | publicId: ${m.publicId} | URL: ${m.secureUrl}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
