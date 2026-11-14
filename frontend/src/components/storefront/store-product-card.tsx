"use client";

import { useState } from "react";
import Link from "next/link";
import { useStoreCart } from "@/stores/store-cart.store";
import type { StoreProduct } from "@/data/tools-catalog";

interface StoreProductCardProps {
  product: StoreProduct;
  showQuickView?: boolean;
}

const BADGE_STYLES: Record<string, string> = {
  NEW: "bg-peach-dark text-white",
  "BEST SELLER": "bg-charcoal text-white",
  LIMITED: "bg-red-500 text-white",
  TRENDING: "bg-peach text-charcoal",
  POPULAR: "bg-charcoal text-white",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((t) => (
        <svg
          key={t}
          className={`w-3 h-3 ${t <= Math.round(rating) ? "text-peach-dark" : "text-peach-light"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function StoreProductCard({ product, showQuickView = true }: StoreProductCardProps) {
  const { addItem } = useStoreCart();
  const [isWishlisted, setIsWishlisted] = useState(false);

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : null;

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addItem({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      sellingPrice: product.price,
      unit: product.unit || product.size || "Unit",
      imageUrl: product.images[0],
      category: product.category,
      brand: product.brand,
      available: product.stockCount,
    });
  };

  const toggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWishlisted((prev) => !prev);
  };

  const detailUrl = `/product/${product.slug || product.sku}`;

  return (
    <div className="product-card group relative bg-white rounded-2xl overflow-hidden border border-peach-light/60 hover:border-peach/40 shadow-sm">
      <div className="relative overflow-hidden bg-peach-xlight aspect-[4/4.1]">
        <Link href={detailUrl}>
          {product.images[0] ? (
            <img
              src={product.images[0]}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div aria-hidden="true" className="grid h-full w-full place-items-center bg-peach-xlight text-sm text-charcoal-light">
              No image available
            </div>
          )}
          {product.images[1] && (
            <img
              src={product.images[1]}
              alt={`${product.name} alternate`}
              className="absolute inset-0 w-full h-full object-cover opacity-0 group-hover:opacity-100 transition-opacity duration-500"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          )}
        </Link>

        {/* Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap items-center gap-1">
          {!product.inStock && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-red-700 border border-red-200">
              OUT OF STOCK
            </span>
          )}
          {product.badge && (
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                BADGE_STYLES[product.badge] || "bg-peach text-charcoal"
              }`}
            >
              {product.badge}
            </span>
          )}
          {discountPercent && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-600">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          type="button"
          onClick={toggleWishlist}
          className={`absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${
            isWishlisted
              ? "bg-red-500 text-white scale-110"
              : "bg-white/80 text-charcoal-light hover:bg-white hover:text-red-500"
          }`}
          aria-label="Wishlist"
        >
          <svg
            className="w-4 h-4"
            fill={isWishlisted ? "currentColor" : "none"}
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
            />
          </svg>
        </button>

        {/* Slide-Up Add to Cart */}
        {showQuickView && (
          <div className="absolute bottom-0 left-0 right-0 translate-y-0 transition-transform duration-300 [@media(hover:hover)]:translate-y-full [@media(hover:hover)]:group-hover:translate-y-0">
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={!product.inStock}
              className="w-full py-3 bg-charcoal text-white text-xs font-bold tracking-wider hover:bg-peach-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {product.inStock ? "ADD TO CART" : "OUT OF STOCK"}
            </button>
          </div>
        )}
      </div>

      <div className="p-2.5 sm:p-3">
        {product.brand && (
          <p className="mb-1 hidden text-[10px] font-bold uppercase tracking-[0.12em] text-peach-dark sm:block">
            {product.brand}
          </p>
        )}

        <Link
          href={detailUrl}
          className="line-clamp-2 block text-sm font-semibold leading-snug text-charcoal transition-colors hover:text-peach-dark"
        >
          {product.name}
        </Link>

        {(product.model || (product.specifications && Object.keys(product.specifications).length > 0)) && (
          <div className="mt-1.5 mb-2 flex min-w-0 items-start justify-between gap-3 text-[10px] leading-snug text-charcoal-light">
            {product.model && (
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-charcoal">Model: {product.model}</p>
              </div>
            )}
            {product.specifications && Object.entries(product.specifications).length > 0 && (
              <div className="hidden min-w-0 flex-1 space-y-0.5 text-right sm:block">
                {Object.entries(product.specifications).slice(0, 2).map(([key, value]) => (
                  <p key={key} className="truncate">
                    <span className="font-medium text-charcoal">{key}:</span> {value}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {product.rating > 0 && product.reviewCount > 0 && (
          <div className="mb-2 hidden items-center gap-1.5 sm:flex">
            <StarRating rating={product.rating} />
            <span className="text-[11px] text-charcoal-light">
              {product.rating} ({product.reviewCount.toLocaleString()})
            </span>
          </div>
        )}

        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="text-sm font-bold text-charcoal sm:text-base">
                ₦{product.price.toLocaleString("en-NG")}
              </span>
              {product.originalPrice != null && (
                <span className="hidden text-xs text-charcoal-light line-through sm:inline">
                  ₦{product.originalPrice.toLocaleString("en-NG")}
                </span>
              )}
            </div>
          </div>

          {(product.size || product.unit) && (
            <span className="hidden shrink-0 rounded border border-peach-light bg-peach-xlight px-1.5 py-0.5 text-[10px] text-charcoal-light sm:inline">
              {product.size || product.unit}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
