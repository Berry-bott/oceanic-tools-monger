import { notFound } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { ProductDetailClient } from "@/components/storefront/product-detail-client";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { StoreFooter } from "@/components/storefront/store-footer";
import {
  TOOLS_PRODUCTS,
  type StoreProduct,
} from "@/data/tools-catalog";

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string; sku: string }>;
}) {
  const { storeSlug, sku } = await params;
  const decodedSku = decodeURIComponent(sku).toLowerCase();

  // 1. Check tools catalog first
  let product: StoreProduct | undefined = TOOLS_PRODUCTS.find(
    (p) =>
      p.slug.toLowerCase() === decodedSku ||
      p.sku.toLowerCase() === decodedSku ||
      p.id.toLowerCase() === decodedSku
  );

  // 2. Fall back to backend database lookup
  if (!product) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/store/products/${encodeURIComponent(sku)}?store=${encodeURIComponent(storeSlug)}`,
        { cache: "no-store" }
      ).catch(() => null);

      if (response?.ok) {
        const result = (await response.json()) as { data?: any };
        const backendProduct = result.data;
        if (backendProduct) {
          const extractedImages =
            backendProduct.images && backendProduct.images.length > 0
              ? backendProduct.images
                  .map((img: any) => (typeof img === "string" ? img : img.imageUrl))
                  .filter((url: any): url is string => Boolean(url))
              : [];

          product = {
            id: backendProduct.id,
            sku: backendProduct.sku,
            slug: backendProduct.sku,
            name: backendProduct.name,
            brand: backendProduct.brand || "Oceanic Tools Professional",
            category: backendProduct.category || "Power Tools",
            categorySlug: (backendProduct.category || "power-tools")
              .toLowerCase()
              .replace(/\s+/g, "-"),
            price: Number(backendProduct.sellingPrice || 25000),
            originalPrice: Math.round(Number(backendProduct.sellingPrice || 25000) * 1.15),
            images:
              extractedImages.length > 0
                ? extractedImages
                : ["https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format"],
            badge: backendProduct.available > 0 && backendProduct.available < 15 ? "LIMITED" : "POPULAR",
            rating: 4.8,
            reviewCount: 120,
            inStock: backendProduct.available > 0,
            stockCount: backendProduct.available,
            description:
              backendProduct.description ||
              "Heavy-duty industrial equipment built for high performance and durability on Nigerian jobsites.",
            benefits: [
              "Continuous duty motor built for heavy site operations",
              "Thermal overload and surge protection",
              "Comprehensive 1-year manufacturer warranty",
            ],
            unit: backendProduct.unit || "Unit",
          };
        }
      }
    } catch {
      // Backend not reached
    }
  }

  if (!product) notFound();

  const related = TOOLS_PRODUCTS.filter(
    (p) => p.categorySlug === product?.categorySlug && p.id !== product?.id
  ).slice(0, 4);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      <StoreHeader />
      <main className="flex-1">
        <ProductDetailClient product={product} relatedProducts={related} />
      </main>
      <StoreCartDrawer />
      <StoreFooter />
    </div>
  );
}
