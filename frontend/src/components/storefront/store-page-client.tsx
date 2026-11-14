"use client";

import { useEffect, useMemo, useState } from "react";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreCatalog } from "@/components/storefront/store-catalog";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreFooter } from "@/components/storefront/store-footer";
import type { StoreProduct as ToolStoreProduct } from "@/data/tools-catalog";
import { fetchStoreCollections, fetchStoreProducts, type StoreProduct as BackendProduct, type StoreInfo, type StoreCategorySummary, type StoreCollections } from "@/services/store/store.service";

type StorePageClientProps = {
  initialProducts: BackendProduct[];
  storeInfo: StoreInfo | null;
  storeSlug?: string;
  categories?: StoreCategorySummary[];
  collections: StoreCollections;
  selectedCategory?: string;
  selectedBadge?: string;
  searchFilter?: string;
  catalogView?: boolean;
};

export function StorePageClient({
  initialProducts,
  storeInfo,
  storeSlug,
  categories,
  collections,
  selectedCategory,
  selectedBadge,
  searchFilter,
  catalogView = false,
}: StorePageClientProps) {
  const [currentProducts, setCurrentProducts] = useState(initialProducts);
  const [currentCollections, setCurrentCollections] = useState(collections);

  useEffect(() => setCurrentProducts(initialProducts), [initialProducts]);
  useEffect(() => setCurrentCollections(collections), [collections]);

  useEffect(() => {
    let active = true;
    const refreshProducts = async () => {
      try {
        const [latestProducts, latestCollections] = await Promise.all([
          fetchStoreProducts(storeSlug),
          fetchStoreCollections(storeSlug),
        ]);
        if (active) {
          setCurrentProducts(latestProducts);
          setCurrentCollections(latestCollections);
        }
      } catch {
        // Keep the last known catalogue if the network is temporarily unavailable.
      }
    };
    void refreshProducts();
    const interval = window.setInterval(() => void refreshProducts(), 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshProducts();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [storeSlug]);

  const mappedCollections = useMemo(() => {
    const mapProducts = (backendProducts: BackendProduct[]): ToolStoreProduct[] =>
      backendProducts.map((p) => {
        const extractedImages =
          p.images && p.images.length > 0
            ? p.images
                .map((img) => (typeof img === "string" ? img : img.imageUrl))
                .filter((url): url is string => Boolean(url))
            : [];

        return {
          id: p.id,
          sku: p.sku,
          slug: p.sku,
          name: p.name,
          brand: p.brand || "",
          category: p.category || "",
          subcategory: p.subcategory,
          model: p.model,
          categorySlug: (p.category || "")
            .toLowerCase()
            .replace(/\s+/g, "-"),
          createdAt: p.createdAt,
          price: Number(p.sellingPrice),
          originalPrice: p.originalPrice == null ? undefined : Number(p.originalPrice),
          images: extractedImages,
          badge: p.badge ?? undefined,
          rating: p.averageRating == null ? 0 : Number(p.averageRating),
          reviewCount: p.reviewCount,
          inStock: p.available > 0,
          stockCount: p.available,
          description: p.description || "",
          specifications: Object.fromEntries((p.specifications ?? []).map(({ name, value }) => [name, value])),
          unit: p.unit,
        };
      });
    return {
      products: mapProducts(currentProducts),
      trendingProducts: mapProducts(currentCollections.trending),
      newArrivals: mapProducts(currentCollections.newArrivals),
    };
  }, [currentProducts, currentCollections]);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0 font-sans selection:bg-peach-light selection:text-peach-deep">
      {/* Oceanic Tools Header */}
      <StoreHeader />

      {/* Main Storefront Body */}
      <main className="flex-1">
        <StoreCatalog
          initialProducts={mappedCollections.products}
          trendingProducts={mappedCollections.trendingProducts}
          newArrivals={mappedCollections.newArrivals}
          categories={categories}
          storeName={storeInfo?.name || "Oceanic Tools Monger"}
          storeSlug={storeSlug || storeInfo?.storeSlug || "oceanic-tools-monger"}
          selectedCategory={selectedCategory}
          selectedBadge={selectedBadge}
          searchFilter={searchFilter}
          catalogView={catalogView}
        />
      </main>

      {/* Slide-out Cart Drawer with Free Delivery Meter */}
      <StoreCartDrawer storeSlug={storeSlug || storeInfo?.storeSlug} />

      {/* Mobile Bottom Tab Navigation */}
      <MobileBottomNav />

      {/* Industrial Footer */}
      <StoreFooter />
    </div>
  );
}
