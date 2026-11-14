import { fetchStoreCategories, fetchStoreCollections, fetchStoreInfo, fetchStoreProducts } from "@/services/store/store.service";
import { StorePageClient } from "@/components/storefront/store-page-client";

export default async function StoreSlugPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const [storeInfo, products, categories, collections] = await Promise.all([
    fetchStoreInfo(storeSlug).catch(() => null),
    fetchStoreProducts(storeSlug).catch(() => []),
    fetchStoreCategories(storeSlug).catch(() => []),
    fetchStoreCollections(storeSlug).catch(() => ({ trending: [], newArrivals: [] })),
  ]);

  return (
    <StorePageClient
      initialProducts={products}
      storeInfo={storeInfo}
      storeSlug={storeSlug}
      categories={categories}
      collections={collections}
      catalogView
    />
  );
}
