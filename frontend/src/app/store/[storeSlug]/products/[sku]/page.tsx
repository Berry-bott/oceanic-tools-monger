import { notFound } from "next/navigation";
import { ProductDetailClient } from "@/components/storefront/product-detail-client";
import { mapStoreProductToCatalogProduct } from "@/components/storefront/store-product-mapper";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { StoreFooter } from "@/components/storefront/store-footer";
import { fetchStoreProductBySku, fetchStoreProducts } from "@/services/store/store.service";

export default async function StoreProductPage({
  params,
}: {
  params: Promise<{ storeSlug: string; sku: string }>;
}) {
  const { storeSlug, sku } = await params;
  const backendProduct = await fetchStoreProductBySku(sku, storeSlug);
  if (!backendProduct) notFound();
  const product = mapStoreProductToCatalogProduct(backendProduct);
  const allStoreProducts = await fetchStoreProducts(storeSlug).catch(() => []);
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
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-teal-100 selection:text-teal-900">
      <StoreHeader />
      <main className="flex-1">
        <ProductDetailClient product={product} relatedProducts={related} storeSlug={storeSlug} />
      </main>
      <StoreCartDrawer storeSlug={storeSlug} />
      <StoreFooter />
    </div>
  );
}
