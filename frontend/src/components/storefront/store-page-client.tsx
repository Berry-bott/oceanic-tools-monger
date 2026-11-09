"use client";

import { useMemo } from "react";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreCatalog } from "@/components/storefront/store-catalog";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreFooter } from "@/components/storefront/store-footer";
import {
  TOOLS_PRODUCTS,
  type StoreProduct as ToolStoreProduct,
} from "@/data/tools-catalog";
import type { StoreProduct as BackendProduct, StoreInfo } from "@/services/store/store.service";

type StorePageClientProps = {
  initialProducts: BackendProduct[];
  storeInfo: StoreInfo | null;
  storeSlug?: string;
  selectedCategory?: string;
  selectedBadge?: string;
  searchFilter?: string;
};

export function StorePageClient({
  initialProducts,
  storeInfo,
  storeSlug,
  selectedCategory,
  selectedBadge,
  searchFilter,
}: StorePageClientProps) {
  const products: ToolStoreProduct[] = useMemo(() => {
    // If no backend products, return the rich tools catalog
    if (!initialProducts || initialProducts.length === 0) {
      return TOOLS_PRODUCTS;
    }

    // Map backend products and merge with rich specs/images
    const backendMapped: ToolStoreProduct[] = initialProducts.map((p) => {
      const extractedImages =
        p.images && p.images.length > 0
          ? p.images
              .map((img) => (typeof img === "string" ? img : img.imageUrl))
              .filter((url): url is string => Boolean(url))
          : [];

      const fallbackCatalogMatch = TOOLS_PRODUCTS.find(
        (c) =>
          c.sku.toLowerCase() === p.sku?.toLowerCase() ||
          c.name.toLowerCase() === p.name?.toLowerCase() ||
          (p.sku?.toUpperCase() === "ING-01" && c.sku === "ING-01") ||
          (p.sku?.toUpperCase() === "NL-01" && c.sku === "NL-01") ||
          (p.sku?.toUpperCase() === "BOS-GSR180LI" && c.sku === "BOS-GSR180LI")
      );

      const images =
        extractedImages.length > 0
          ? extractedImages
          : fallbackCatalogMatch
          ? fallbackCatalogMatch.images
          : ["https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format"];

      return {
        id: p.id,
        sku: p.sku || p.id,
        slug: fallbackCatalogMatch?.slug || p.sku || p.id,
        name: p.name,
        brand: p.brand || fallbackCatalogMatch?.brand || "Oceanic Tools Monger Professional",
        category: p.category || fallbackCatalogMatch?.category || "Power Tools",
        categorySlug: (p.category || fallbackCatalogMatch?.category || "power-tools")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        price: Number(p.sellingPrice || 25000),
        originalPrice: fallbackCatalogMatch?.originalPrice || Math.round(Number(p.sellingPrice || 25000) * 1.15),
        images,
        badge: fallbackCatalogMatch?.badge || (p.available > 0 && p.available < 15 ? "LIMITED" : "POPULAR"),
        rating: fallbackCatalogMatch?.rating || 4.8,
        reviewCount: fallbackCatalogMatch?.reviewCount || 110,
        inStock: p.available !== undefined ? p.available > 0 : true,
        stockCount: p.available !== undefined ? p.available : 20,
        description:
          p.description ||
          fallbackCatalogMatch?.description ||
          "Heavy duty industrial tool engineered for demanding site construction, metal fabrication, and daily workshop use.",
        benefits: fallbackCatalogMatch?.benefits || [
          "High continuous duty cycle for professional contractors",
          "Ergonomic vibration dampening grip",
          "Comprehensive manufacturer warranty",
        ],
        specifications: fallbackCatalogMatch?.specifications,
        warranty: fallbackCatalogMatch?.warranty || "1 Year Oceanic Tools Monger Warranty",
        unit: p.unit || fallbackCatalogMatch?.unit || "Unit",
        size: fallbackCatalogMatch?.size,
        isBestSeller: fallbackCatalogMatch?.isBestSeller,
        isNew: fallbackCatalogMatch?.isNew,
      };
    });

    // Also include catalog items that aren't yet in the backend DB to present a full equipment store
    const existingSkus = new Set(backendMapped.map((b) => b.sku.toLowerCase()));
    const additionalFromCatalog = TOOLS_PRODUCTS.filter(
      (c) => !existingSkus.has(c.sku.toLowerCase())
    );

    return [...backendMapped, ...additionalFromCatalog];
  }, [initialProducts]);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans selection:bg-peach-light selection:text-peach-deep">
      {/* Oceanic Tools Header */}
      <StoreHeader />

      {/* Main Storefront Body */}
      <main className="flex-1">
        <StoreCatalog
          initialProducts={products}
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
