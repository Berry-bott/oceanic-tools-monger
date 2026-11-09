import { fetchStoreInfo, fetchStoreProducts } from "@/services/store/store.service";
import { StorePageClient } from "@/components/storefront/store-page-client";

interface StorePageProps {
  searchParams?: Promise<{
    category?: string;
    badge?: string;
    search?: string;
  }>;
}

export default async function StoreIndexPage({ searchParams }: StorePageProps) {
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
