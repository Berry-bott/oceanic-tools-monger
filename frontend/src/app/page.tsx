import { fetchStoreInfo, fetchStoreProducts } from "@/services/store/store.service";
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
  const [storeInfo, products] = await Promise.all([
    fetchStoreInfo().catch(() => null),
    fetchStoreProducts().catch(() => []),
  ]);

  return (
    <StorePageClient
      initialProducts={products}
      storeInfo={storeInfo}
      storeSlug={storeInfo?.storeSlug || "oceanic-tools"}
      selectedCategory={resolvedParams.category}
      selectedBadge={resolvedParams.badge}
      searchFilter={resolvedParams.search}
    />
  );
}
