import { fetchStoreInfo, fetchStoreProducts } from "@/services/store/store.service";
import { StorePageClient } from "@/components/storefront/store-page-client";

export default async function StoreSlugPage({
  params,
}: {
  params: Promise<{ storeSlug: string }>;
}) {
  const { storeSlug } = await params;
  const [storeInfo, products] = await Promise.all([
    fetchStoreInfo(storeSlug).catch(() => null),
    fetchStoreProducts(storeSlug).catch(() => []),
  ]);

  return (
    <StorePageClient
      initialProducts={products}
      storeInfo={storeInfo}
      storeSlug={storeSlug}
    />
  );
}
