import type { StoreProduct as CatalogProduct } from "@/data/tools-catalog";
import type { StoreProduct as ApiProduct } from "@/services/store/store.service";

export function mapStoreProductToCatalogProduct(product: ApiProduct): CatalogProduct {
  return {
    id: product.id,
    sku: product.sku,
    slug: product.sku,
    name: product.name,
    brand: product.brand ?? "",
    category: product.category,
    subcategory: product.subcategory,
    model: product.model,
    categorySlug: product.category.toLowerCase().trim().replace(/\s+/g, "-"),
    price: Number(product.sellingPrice),
    originalPrice: product.originalPrice == null ? undefined : Number(product.originalPrice),
    images: (product.images ?? []).map((image) => image.imageUrl).filter((image): image is string => Boolean(image)),
    badge: product.badge ?? undefined,
    rating: product.averageRating == null ? 0 : Number(product.averageRating),
    reviewCount: product.reviewCount,
    inStock: product.available > 0,
    stockCount: product.available,
    description: product.description ?? "",
    specifications: Object.fromEntries((product.specifications ?? []).map(({ name, value }) => [name, value])),
    reviews: product.reviews,
    unit: product.unit,
  };
}
