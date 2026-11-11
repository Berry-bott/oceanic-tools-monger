"use client";

import { useMemo } from "react";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreCatalog } from "@/components/storefront/store-catalog";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreFooter } from "@/components/storefront/store-footer";
import type { StoreProduct as ToolStoreProduct } from "@/data/tools-catalog";
import type { StoreProduct as BackendProduct, StoreInfo, StoreCategorySummary, StoreCollections } from "@/services/store/store.service";

type StorePageClientProps = {
  initialProducts: BackendProduct[];
  storeInfo: StoreInfo | null;
  storeSlug?: string;
  categories?: StoreCategorySummary[];
  collections: StoreCollections;
  selectedCategory?: string;
  selectedBadge?: string;
  searchFilter?: string;
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
}: StorePageClientProps) {
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
          categorySlug: (p.category || "")
            .toLowerCase()
            .replace(/\s+/g, "-"),
          createdAt: p.createdAt,
          price: Number(p.sellingPrice),
          images: extractedImages,
          rating: 0,
          reviewCount: 0,
          inStock: p.available > 0,
          stockCount: p.available,
          description: p.description || "",
          unit: p.unit,
        };
      });
    return {
      products: mapProducts(initialProducts),
      trendingProducts: mapProducts(collections.trending),
      newArrivals: mapProducts(collections.newArrivals),
    };
  }, [initialProducts, collections]);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans selection:bg-peach-light selection:text-peach-deep">
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
        />
      </main>

      {/* Slide-out Cart Drawer with Free Delivery Meter */}
      <StoreCartDrawer />

      {/* Mobile Bottom Tab Navigation */}
      <MobileBottomNav />

      {/* Industrial Footer */}
      <StoreFooter />
    </div>
  );
}
