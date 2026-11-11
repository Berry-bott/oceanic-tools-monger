import Link from "next/link";
import { StoreHeader } from "@/components/storefront/store-header";
import { ProductDetailClient } from "@/components/storefront/product-detail-client";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreFooter } from "@/components/storefront/store-footer";
import { fetchStoreProductBySku } from "@/services/store/store.service";
import {
  TOOLS_PRODUCTS,
  type StoreProduct,
} from "@/data/tools-catalog";

interface ProductPageProps {
  params: Promise<{ sku: string }>;
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { sku } = await params;
  const decodedSku = decodeURIComponent(sku).toLowerCase();

  let product: StoreProduct | undefined;

  // 1. Check backend database first (primary source of truth for products & live images)
  try {
    const backendProduct = await fetchStoreProductBySku(sku);
    if (backendProduct) {
      const extractedImages =
        backendProduct.images && backendProduct.images.length > 0
          ? backendProduct.images
              .map((img) => (typeof img === "string" ? img : img.imageUrl))
              .filter((url): url is string => Boolean(url))
          : [];

      // Find any rich catalog specs or benefits if present
      const catalogMatch = TOOLS_PRODUCTS.find(
        (c) =>
          c.sku.toLowerCase() === backendProduct.sku.toLowerCase() ||
          c.name.toLowerCase() === backendProduct.name.toLowerCase() ||
          c.slug.toLowerCase() === decodedSku
      );

      product = {
        id: backendProduct.id,
        sku: backendProduct.sku,
        slug: backendProduct.sku,
        name: backendProduct.name,
        brand: backendProduct.brand || catalogMatch?.brand || "Oceanic Tools Monger Professional",
        category: backendProduct.category || catalogMatch?.category || "Power Tools",
        categorySlug: (backendProduct.category || catalogMatch?.category || "power-tools")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        price: Number(backendProduct.sellingPrice || 25000),
        originalPrice: catalogMatch?.originalPrice || Math.round(Number(backendProduct.sellingPrice || 25000) * 1.15),
        images:
          extractedImages.length > 0
            ? extractedImages
            : catalogMatch?.images || ["/workshop-drill.jpg"],
        badge: catalogMatch?.badge || (backendProduct.available > 0 && backendProduct.available < 15 ? "LIMITED" : "POPULAR"),
        rating: catalogMatch?.rating || 4.8,
        reviewCount: catalogMatch?.reviewCount || 120,
        inStock: backendProduct.available > 0,
        stockCount: backendProduct.available,
        description:
          backendProduct.description ||
          catalogMatch?.description ||
          "Heavy-duty industrial equipment built for high performance and durability on Nigerian jobsites.",
        benefits: catalogMatch?.benefits || [
          "Continuous duty motor built for heavy site operations",
          "Thermal overload and surge protection",
          "Comprehensive 1-year manufacturer warranty",
        ],
        specifications: catalogMatch?.specifications,
        unit: backendProduct.unit || catalogMatch?.unit || "Unit",
        warranty: catalogMatch?.warranty || "1 Year Oceanic Tools Monger Warranty",
      };
    }
  } catch {
    // If backend request fails, fall through to static catalog fallback
  }

  // 2. Fallback to tools-catalog if product is not in backend database
  if (!product) {
    product = TOOLS_PRODUCTS.find(
      (p) =>
        p.slug.toLowerCase() === decodedSku ||
        p.sku.toLowerCase() === decodedSku ||
        p.id.toLowerCase() === decodedSku
    );
  }

  if (!product) {
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
        <StoreCartDrawer />
        <MobileBottomNav />
        <StoreFooter />
      </div>
    );
  }

  const related = TOOLS_PRODUCTS.filter(
    (p) => p.categorySlug === product?.categorySlug && p.id !== product?.id
  ).slice(0, 4);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans selection:bg-peach-light selection:text-peach-deep">
      <StoreHeader />
      <main className="flex-1">
        <ProductDetailClient product={product} relatedProducts={related} />
      </main>
      <StoreCartDrawer />
      <MobileBottomNav />
      <StoreFooter />
    </div>
  );
}
