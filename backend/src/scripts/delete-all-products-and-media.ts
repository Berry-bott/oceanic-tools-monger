import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { getCloudinary } from "../lib/cloudinary.js";

async function main() {
  console.log("=== 1. Wiping Products & Media Assets from Database ===");

  // Delete product image relations first
  const deletedProductImages = await prisma.productImage.deleteMany({});
  console.log(`Deleted ${deletedProductImages.count} ProductImage records.`);

  // Delete product specifications
  const deletedSpecs = await prisma.productSpecification.deleteMany({});
  console.log(`Deleted ${deletedSpecs.count} ProductSpecification records.`);

  // Delete stock balances and lots
  const deletedBalances = await prisma.stockBalance.deleteMany({});
  console.log(`Deleted ${deletedBalances.count} StockBalance records.`);

  const deletedLots = await prisma.stockLot.deleteMany({});
  console.log(`Deleted ${deletedLots.count} StockLot records.`);

  const deletedMovements = await prisma.stockMovement.deleteMany({});
  console.log(`Deleted ${deletedMovements.count} StockMovement records.`);

  // Delete all media assets from DB first because of MediaAsset_productId_fkey RESTRICT constraint
  const deletedMedia = await prisma.mediaAsset.deleteMany({});
  console.log(`Deleted ${deletedMedia.count} MediaAsset records.`);

  // Delete products
  const deletedProducts = await prisma.product.deleteMany({});
  console.log(`Deleted ${deletedProducts.count} Product records.`);

  // Delete categories and subcategories
  const deletedSubcategories = await prisma.subcategory.deleteMany({});
  console.log(`Deleted ${deletedSubcategories.count} Subcategory records.`);

  const deletedCategories = await prisma.category.deleteMany({});
  console.log(`Deleted ${deletedCategories.count} Category records.`);

  console.log("\n=== 2. Cleaning Cloudinary Assets ===");
  try {
    const cloudinary = getCloudinary();
    const res = await cloudinary.api.resources({
      type: "upload",
      prefix: "oceanic-tools",
      max_results: 500,
    });
    console.log(`Found ${res.resources.length} Cloudinary assets to delete.`);
    if (res.resources.length > 0) {
      const publicIds = res.resources.map((r: { public_id: string }) => r.public_id);
      const delRes = await cloudinary.api.delete_resources(publicIds);
      console.log("Cloudinary deletion result:", delRes);
    }
  } catch (err) {
    console.error("Cloudinary cleanup error:", err);
  }

  console.log("\n=== 3. Verification ===");
  const pCount = await prisma.product.count();
  const mCount = await prisma.mediaAsset.count();
  const cCount = await prisma.category.count();
  console.log(`Remaining Products in DB: ${pCount}`);
  console.log(`Remaining Media Assets in DB: ${mCount}`);
  console.log(`Remaining Categories in DB: ${cCount}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
