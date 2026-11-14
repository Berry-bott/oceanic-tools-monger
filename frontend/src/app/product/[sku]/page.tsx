import Link from "next/link";
import { StoreHeader } from "@/components/storefront/store-header";
import { ProductDetailClient } from "@/components/storefront/product-detail-client";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreFooter } from "@/components/storefront/store-footer";
import { mapStoreProductToCatalogProduct } from "@/components/storefront/store-product-mapper";
import { fetchStoreInfo, fetchStoreProductBySku, fetchStoreProducts } from "@/services/store/store.service";

interface ProductPageProps {
  params: Promise<{ sku: string }>;
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { sku } = await params;
  const [backendProduct, store] = await Promise.all([
    fetchStoreProductBySku(sku).catch(() => null),
    fetchStoreInfo().catch(() => null),
  ]);
  if (!backendProduct) {
    return (
      <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans">
        <StoreHeader />
        <main className="flex-1 flex flex-col items-center justify-center py-24 px-6 text-center">
          <div className="w-20 h-20 rounded-full bg-peach-light/60 text-peach-dark flex items-center justify-center mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
          </div>
          <h1 className="font-display text-3xl text-charcoal mb-3 tracking-tight">
            Equipment Not Found
          </h1>
          <p className="text-charcoal-light max-w-md mb-8 text-sm">
            We couldn&apos;t locate the tool or part SKU you searched for. It may have been re-indexed or temporarily sold out.
          </p>
          <Link
            href="/store"
            className="px-8 py-3.5 bg-peach-dark text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-peach-deep transition-colors shadow-md"
          >
            Explore Equipment Catalog
          </Link>
        </main>
        <StoreCartDrawer storeSlug={store?.storeSlug} />
        <MobileBottomNav />
        <StoreFooter />
      </div>
    );
  }

  const product = mapStoreProductToCatalogProduct(backendProduct);
  const allStoreProducts = await fetchStoreProducts().catch(() => []);
  const currentCategory = (backendProduct.category || "").trim().toLowerCase();

  const sameCategory = allStoreProducts.filter(
    (item) =>
      item.id !== backendProduct.id &&
      (item.category || "").trim().toLowerCase() === currentCategory
  );
  const otherProducts = allStoreProducts.filter(
    (item) =>
      item.id !== backendProduct.id &&
      (item.category || "").trim().toLowerCase() !== currentCategory
  );

  const related = [...sameCategory, ...otherProducts]
    .slice(0, 4)
    .map(mapStoreProductToCatalogProduct);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans selection:bg-peach-light selection:text-peach-deep">
      <StoreHeader />
      <main className="flex-1">
        <ProductDetailClient product={product} relatedProducts={related} storeSlug={store?.storeSlug} />
      </main>
      <StoreCartDrawer storeSlug={store?.storeSlug} />
      <MobileBottomNav />
      <StoreFooter />
    </div>
  );
}
