import { fetchStoreCategories, fetchStoreCollections, fetchStoreInfo, fetchStoreProducts } from "@/services/store/store.service";
import { StorePageClient } from "@/components/storefront/store-page-client";

interface HomePageProps {
  searchParams?: Promise<{
    category?: string;
    badge?: string;
    search?: string;
  }>;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const resolvedParams = searchParams ? await searchParams : {};
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
      selectedCategory={resolvedParams.category}
      selectedBadge={resolvedParams.badge}
      searchFilter={resolvedParams.search}
    />
  );
}
