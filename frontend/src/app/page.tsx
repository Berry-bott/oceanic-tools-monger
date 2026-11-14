import { fetchStoreCategories, fetchStoreCollections, fetchStoreInfo, fetchStoreProducts } from "@/services/store/store.service";
import { StorePageClient } from "@/components/storefront/store-page-client";

export default async function HomePage() {
  const [storeInfo, products, categories, collections] = await Promise.all([
    fetchStoreInfo().catch(() => null),
    fetchStoreProducts().catch(() => []),
    fetchStoreCategories().catch(() => []),
    fetchStoreCollections().catch(() => ({ trending: [], newArrivals: [] })),
  ]);

  return (
    <StorePageClient
      initialProducts={products}
      storeInfo={storeInfo}
      storeSlug={storeInfo?.storeSlug || "oceanic-tools"}
      categories={categories}
      collections={collections}
    />
  );
}
