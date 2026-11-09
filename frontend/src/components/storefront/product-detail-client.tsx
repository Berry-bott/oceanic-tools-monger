"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Product3DViewer } from "./product-3d-viewer";
import { StoreProductCard } from "./store-product-card";
import { useStoreCart } from "@/stores/store-cart.store";
import {
  TOOLS_PRODUCTS,
  CUSTOMER_REVIEWS,
  type StoreProduct,
} from "@/data/tools-catalog";

interface ProductDetailClientProps {
  product: StoreProduct;
  relatedProducts?: StoreProduct[];
  storeSlug?: string;
  branches?: any[];
}

const TABS = ["Description", "Benefits", "Specifications", "How to Use", "Reviews"] as const;
type TabType = (typeof TABS)[number];

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const iconSize = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((t) => (
        <svg
          key={t}
          className={`${iconSize} ${t <= Math.round(rating) ? "text-peach-dark" : "text-peach-light"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function ProductDetailClient({
  product,
  relatedProducts = [],
}: ProductDetailClientProps) {
  const router = useRouter();
  const { addItem, setDrawerOpen } = useStoreCart();
  const [viewMode, setViewMode] = useState<"3d" | "photo">("3d");
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>("Description");
  const [isWishlisted, setIsWishlisted] = useState(false);

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : null;

  const handleAddToCart = () => {
    addItem(
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sellingPrice: product.price,
        unit: product.unit || product.size || "Unit",
        imageUrl: product.images[0],
        category: product.category,
        brand: product.brand,
      },
      quantity
    );
    setDrawerOpen(true);
  };

  const handleBuyNow = () => {
    addItem(
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sellingPrice: product.price,
        unit: product.unit || product.size || "Unit",
        imageUrl: product.images[0],
        category: product.category,
        brand: product.brand,
      },
      quantity
    );
    router.push("/checkout");
  };

  const fallBackRelated =
    relatedProducts.length > 0
      ? relatedProducts
      : TOOLS_PRODUCTS.filter(
          (p) => p.categorySlug === product.categorySlug && p.id !== product.id
        ).slice(0, 4);

  return (
    <div className="min-h-screen bg-white text-charcoal font-sans">
      {/* Breadcrumbs */}
      <div className="bg-cream border-b border-peach-light">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2 text-xs text-charcoal-light">
          <Link href="/" className="hover:text-peach-dark transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/store" className="hover:text-peach-dark transition-colors">
            Shop
          </Link>
          <span>/</span>
          <Link
            href={`/store?category=${product.category}`}
            className="hover:text-peach-dark transition-colors"
          >
            {product.category}
          </Link>
          <span>/</span>
          <span className="text-charcoal line-clamp-1">{product.name}</span>
        </div>
      </div>

      {/* Main Showcase */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left Column: 3D Viewer or Photos */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === "3d"
                    ? "bg-peach-dark text-white"
                    : "bg-peach-light text-charcoal hover:bg-peach"
                }`}
              >
                <span>3D View</span>
                <span className="bg-white/30 text-[9px] px-1.5 py-0.5 rounded-full font-black">
                  NEW
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("photo")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === "photo"
                    ? "bg-peach-dark text-white"
                    : "bg-peach-light text-charcoal hover:bg-peach"
                }`}
              >
                Photos ({product.images.length})
              </button>
            </div>

            {viewMode === "3d" ? (
              <Product3DViewer images={product.images} productName={product.name} />
            ) : (
              <div className="space-y-3">
                <div className="aspect-square rounded-2xl overflow-hidden bg-peach-xlight flex items-center justify-center p-6 border border-peach-light">
                  <img
                    src={product.images[activePhotoIdx] || product.images[0] || "/workshop-drill.jpg"}
                    alt={product.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      e.currentTarget.src = "/workshop-drill.jpg";
                    }}
                  />
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-2">
                    {product.images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all p-1 bg-white ${
                          activePhotoIdx === idx
                            ? "border-peach-dark"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.src = "/workshop-drill.jpg";
                          }}
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Info & Purchase Form */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase">
                {product.brand}
              </span>
              <div className="flex gap-1.5">
                {product.badge && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-peach text-charcoal">
                    {product.badge}
                  </span>
                )}
                {discountPercent && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white">
                    -{discountPercent}%
                  </span>
                )}
              </div>
            </div>

            <h1 className="font-display text-3xl md:text-4xl font-bold text-charcoal leading-tight">
              {product.name}
            </h1>

            <div className="flex items-center gap-3">
              <StarRating rating={product.rating} size="lg" />
              <span className="text-sm font-bold text-charcoal">{product.rating}</span>
              <span className="text-sm text-charcoal-light">
                ({product.reviewCount.toLocaleString()} contractor reviews)
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-charcoal">
                ₦{product.price.toLocaleString("en-NG")}
              </span>
              {product.originalPrice && (
                <span className="text-lg text-charcoal-light line-through">
                  ₦{product.originalPrice.toLocaleString("en-NG")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  product.inStock ? "bg-green-500 animate-pulse" : "bg-red-400"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  product.inStock ? "text-green-700" : "text-red-500"
                }`}
              >
                {product.inStock
                  ? (product.stockCount || 20) < 15
                    ? `Only ${product.stockCount} left in stock!`
                    : "In Stock — Ready for site dispatch"
                  : "Out of Stock"}
              </span>
            </div>

            <p className="text-sm text-charcoal-light leading-relaxed">
              {product.description}
            </p>

            {/* Spec Attributes Summary Grid */}
            <div className="grid grid-cols-2 gap-3 py-4 border-y border-peach-light">
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Size / Package
                </p>
                <p className="text-sm font-medium text-charcoal">
                  {product.unit || product.size || "1 Unit"}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Duty Rating
                </p>
                <p className="text-sm font-medium text-charcoal">
                  Heavy Industrial Duty
                </p>
              </div>
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Category
                </p>
                <p className="text-sm font-medium text-charcoal">{product.category}</p>
              </div>
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Brand / SKU
                </p>
                <p className="text-sm font-medium text-charcoal font-mono">
                  {product.sku}
                </p>
              </div>
            </div>

            {/* Stepper + Buttons */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center border border-peach rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-11 flex items-center justify-center text-charcoal hover:bg-peach-xlight transition-colors text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-semibold text-base">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(product.stockCount || 50, q + 1))}
                    className="w-10 h-11 flex items-center justify-center text-charcoal hover:bg-peach-xlight transition-colors text-lg font-bold"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm text-charcoal-light">
                  Max {product.stockCount || 50} per order
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!product.inStock}
                  className="flex-1 py-3.5 bg-charcoal text-white rounded-xl font-semibold text-sm hover:bg-peach-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={!product.inStock}
                  className="flex-1 py-3.5 bg-peach-dark text-white rounded-xl font-semibold text-sm text-center hover:bg-peach-deep transition-colors shadow-sm disabled:opacity-50"
                >
                  Buy Now
                </button>
                <button
                  type="button"
                  onClick={() => setIsWishlisted((w) => !w)}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${
                    isWishlisted
                      ? "bg-red-500 border-red-500 text-white"
                      : "border-peach text-charcoal-light hover:border-red-300 hover:text-red-500"
                  }`}
                  aria-label="Wishlist"
                >
                  <svg
                    className="w-5 h-5"
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
              </div>
            </div>

            {/* 4 Trust Ticks */}
            <div className="flex flex-wrap gap-3 text-xs text-charcoal-light pt-2">
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Authentic product
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Secure checkout
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Fast delivery
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Easy returns
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Tabs */}
        <div className="mt-16">
          <div className="flex gap-1 border-b border-peach-light overflow-x-auto hide-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-peach-dark text-peach-dark"
                    : "border-transparent text-charcoal-light hover:text-charcoal"
                }`}
              >
                {tab}
                {tab === "Reviews" && ` (${CUSTOMER_REVIEWS.length})`}
              </button>
            ))}
          </div>

          <div className="pt-8 max-w-2xl">
            {activeTab === "Description" && (
              <p className="text-sm text-charcoal-light leading-relaxed">
                {product.description}
              </p>
            )}

            {activeTab === "Benefits" && (
              <ul className="space-y-3">
                {(product.benefits || [
                  "High continuous duty cycle for heavy commercial operations",
                  "Overload protection and surge arrestor",
                  "Vibration dampening ergonomic grip",
                ]).map((b, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-charcoal-light">
                    <span className="w-5 h-5 rounded-full bg-peach-light text-peach-dark flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold">
                      ✓
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {activeTab === "Specifications" && (
              <div className="border border-peach-light rounded-2xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y divide-peach-light/60">
                    {product.specifications ? (
                      Object.entries(product.specifications).map(([key, val]) => (
                        <tr key={key} className="hover:bg-peach-xlight/30">
                          <td className="px-5 py-3 font-semibold text-charcoal w-1/3 bg-peach-xlight/40">
                            {key}
                          </td>
                          <td className="px-5 py-3 text-charcoal font-mono">{val}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-5 py-3 font-semibold text-charcoal">Brand / SKU</td>
                        <td className="px-5 py-3 text-charcoal">{product.brand} ({product.sku})</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "How to Use" && (
              <ol className="space-y-3">
                {[
                  "Verify that power source or battery matches rated voltage specifications.",
                  "Inspect accessories, blades, chuck, or fasteners before operation.",
                  "Wear approved eye protection, ear defenders, and safety footwear.",
                  "Perform initial dry run at low speed before engaging full workload.",
                  "Store in clean, dry environment; service carbon brushes periodically.",
                ].map((step, idx) => (
                  <li key={idx} className="flex items-start gap-3 text-sm text-charcoal-light">
                    <span className="w-6 h-6 rounded-full bg-peach-light text-peach-dark flex items-center justify-center flex-shrink-0 font-bold text-xs">
                      {idx + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            )}

            {activeTab === "Reviews" && (
              <div className="space-y-6">
                <div className="flex items-center gap-6 p-6 bg-peach-xlight rounded-2xl">
                  <div className="text-center">
                    <p className="text-5xl font-bold text-charcoal font-display">
                      {product.rating}
                    </p>
                    <StarRating rating={product.rating} size="lg" />
                    <p className="text-xs text-charcoal-light mt-1">
                      {product.reviewCount} contractor reviews
                    </p>
                  </div>
                  <div className="flex-1 space-y-2">
                    {[
                      { star: 5, pct: 76 },
                      { star: 4, pct: 16 },
                      { star: 3, pct: 6 },
                      { star: 2, pct: 2 },
                      { star: 1, pct: 0 },
                    ].map((row) => (
                      <div key={row.star} className="flex items-center gap-2 text-xs">
                        <span className="w-3 text-charcoal-light">{row.star}</span>
                        <svg className="w-3 h-3 text-peach-dark" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z" />
                        </svg>
                        <div className="flex-1 h-1.5 bg-peach-light rounded-full overflow-hidden">
                          <div
                            className="h-full bg-peach-dark rounded-full"
                            style={{ width: `${row.pct}%` }}
                          />
                        </div>
                        <span className="text-charcoal-light w-7 text-right">{row.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>

                {CUSTOMER_REVIEWS.map((rev, idx) => (
                  <div key={idx} className="border-b border-peach-light pb-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-peach text-charcoal font-bold text-xs flex items-center justify-center">
                          {rev.name[0]}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-charcoal">{rev.name}</p>
                          {rev.verified && (
                            <p className="text-[10px] text-green-600 font-medium">
                              ✓ Verified Site Contractor
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StarRating rating={rev.rating} />
                        <span className="text-xs text-charcoal-light">{rev.date}</span>
                      </div>
                    </div>
                    <p className="text-sm text-charcoal-light leading-relaxed">{rev.text}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* You May Also Like */}
        {fallBackRelated.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-2xl font-bold text-charcoal mb-6">
              You May Also Like
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {fallBackRelated.map((p) => (
                <StoreProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
