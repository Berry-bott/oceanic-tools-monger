"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { HeroCarousel } from "./hero-carousel";
import { StoreProductCard } from "./store-product-card";
import {
  TOOLS_PRODUCTS,
  STORE_CATEGORIES,
  type StoreProduct,
} from "@/data/tools-catalog";

interface StoreCatalogProps {
  initialProducts?: StoreProduct[];
  storeName?: string;
  storeSlug?: string;
  selectedCategory?: string;
  selectedBadge?: string;
  searchFilter?: string;
  branches?: any[];
  searchQuery?: string;
  onCategorySelect?: (c: string) => void;
}

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: Low → High" },
  { value: "price-desc", label: "Price: High → Low" },
  { value: "rating", label: "Highest Rated" },
];

const TRUST_BADGES = [
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    title: "Authentic Products",
    desc: "Shop confidently with 100% genuine industrial tools.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z" />
      </svg>
    ),
    title: "Secure Payments",
    desc: "Your payments are protected with bank-level encryption.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10" />
      </svg>
    ),
    title: "Fast Delivery",
    desc: "Reliable nationwide delivery to your doorstep.",
  },
  {
    icon: (
      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M16 15v-1a4 4 0 0 0-4-4H8m0 0l3 3m-3-3 3-3m9 14V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2z" />
      </svg>
    ),
    title: "Easy Returns",
    desc: "Hassle-free returns within 14 days of delivery.",
  },
];

export function StoreCatalog({
  initialProducts = TOOLS_PRODUCTS,
  selectedCategory,
  selectedBadge,
  searchFilter,
}: StoreCatalogProps) {
  const [activeCategory, setActiveCategory] = useState<string>(selectedCategory || "all");
  const [sortOption, setSortOption] = useState<string>("recommended");
  const [maxPrice, setMaxPrice] = useState<number>(350000);
  const [inStockOnly, setInStockOnly] = useState<boolean>(false);
  const [showMobileFilters, setShowMobileFilters] = useState<boolean>(false);

  const products = initialProducts.length > 0 ? initialProducts : TOOLS_PRODUCTS;

  // Filtered & sorted catalog
  const filteredProducts = useMemo(() => {
    let result = products.filter((p) => {
      if (activeCategory !== "all" && p.category.toLowerCase() !== activeCategory.toLowerCase()) {
        return false;
      }
      if (selectedBadge && p.badge !== selectedBadge) {
        return false;
      }
      if (inStockOnly && !p.inStock) {
        return false;
      }
      if (p.price > maxPrice) {
        return false;
      }
      if (searchFilter) {
        const query = searchFilter.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesCat = p.category.toLowerCase().includes(query);
        const matchesBrand = p.brand.toLowerCase().includes(query);
        const matchesSku = p.sku.toLowerCase().includes(query);
        if (!matchesName && !matchesCat && !matchesBrand && !matchesSku) return false;
      }
      return true;
    });

    if (sortOption === "price-asc") {
      result.sort((a, b) => a.price - b.price);
    } else if (sortOption === "price-desc") {
      result.sort((a, b) => b.price - a.price);
    } else if (sortOption === "rating") {
      result.sort((a, b) => b.rating - a.rating);
    } else if (sortOption === "newest") {
      result.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
    }

    return result;
  }, [products, activeCategory, selectedBadge, searchFilter, inStockOnly, maxPrice, sortOption]);

  const trendingProducts = useMemo(
    () => products.filter((p) => p.isBestSeller || p.badge === "TRENDING").slice(0, 8),
    [products]
  );

  const newArrivals = useMemo(
    () => products.filter((p) => p.isNew || p.badge === "NEW" || p.badge === "POPULAR").slice(0, 4),
    [products]
  );

  const isFiltering = activeCategory !== "all" || Boolean(selectedBadge) || Boolean(searchFilter);

  return (
    <div className="min-h-screen bg-white font-sans">
      {/* Hero Carousel on Home */}
      {!isFiltering && <HeroCarousel />}

      {/* Trust Badges Strip */}
      <div className="bg-peach-xlight border-b border-peach-light">
        <div className="max-w-7xl mx-auto px-6 py-5 grid grid-cols-2 md:grid-cols-4 gap-5">
          {TRUST_BADGES.map((e) => (
            <div key={e.title} className="flex items-center gap-3">
              <div className="text-peach-dark flex-shrink-0">{e.icon}</div>
              <div>
                <p className="text-xs font-bold text-charcoal">{e.title}</p>
                <p className="text-[11px] text-charcoal-light leading-tight hidden md:block">
                  {e.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtered view or Full layout */}
      {isFiltering ? (
        <div className="min-h-screen bg-white">
          {/* Header Banner */}
          <div className="bg-peach-xlight border-b border-peach-light">
            <div className="max-w-7xl mx-auto px-6 py-10">
              <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
                Oceanic Tools Monger Collection
              </p>
              <h1 className="font-display text-4xl font-bold text-charcoal">
                {searchFilter
                  ? `Search: "${searchFilter}"`
                  : activeCategory !== "all"
                  ? `${activeCategory}`
                  : "All Equipment"}
              </h1>
              <p className="text-sm text-charcoal-light mt-2">
                {filteredProducts.length} {filteredProducts.length === 1 ? "product" : "products"}
              </p>
            </div>
          </div>

          {/* Shop Body with Sidebar */}
          <div className="max-w-7xl mx-auto px-6 py-8 flex gap-8">
            {/* Desktop Sidebar */}
            <aside className="w-60 flex-shrink-0 hidden lg:block">
              <div className="sticky top-24 space-y-8">
                {/* Categories */}
                <div>
                  <h3 className="font-semibold text-sm text-charcoal mb-3">
                    Categories
                  </h3>
                  <ul className="space-y-1">
                    <li>
                      <button
                        onClick={() => setActiveCategory("all")}
                        className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors ${
                          activeCategory === "all"
                            ? "bg-peach-dark text-white font-semibold"
                            : "text-charcoal-light hover:bg-peach-xlight hover:text-charcoal"
                        }`}
                      >
                        All Products
                      </button>
                    </li>
                    {STORE_CATEGORIES.map((cat) => (
                      <li key={cat.slug}>
                        <button
                          onClick={() => setActiveCategory(cat.name)}
                          className={`w-full text-left text-sm px-3 py-2 rounded-lg transition-colors flex justify-between items-center ${
                            activeCategory.toLowerCase() === cat.name.toLowerCase()
                              ? "bg-peach-dark text-white font-semibold"
                              : "text-charcoal-light hover:bg-peach-xlight hover:text-charcoal"
                          }`}
                        >
                          <span>{cat.name}</span>
                          <span className="text-[11px] opacity-60">{cat.count}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Price Range Slider */}
                <div>
                  <h3 className="font-semibold text-sm text-charcoal mb-3">
                    Price Range
                  </h3>
                  <input
                    type="range"
                    min={0}
                    max={400000}
                    step={10000}
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(Number(e.target.value))}
                    className="w-full accent-peach-dark"
                  />
                  <div className="flex justify-between text-xs text-charcoal-light mt-1">
                    <span>₦0</span>
                    <span className="font-semibold text-peach-dark">
                      Up to ₦{maxPrice.toLocaleString("en-NG")}
                    </span>
                  </div>
                </div>

                {/* Availability */}
                <div>
                  <h3 className="font-semibold text-sm text-charcoal mb-3">
                    Availability
                  </h3>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="accent-peach-dark rounded"
                    />
                    <span className="text-sm text-charcoal-light">In Stock Only</span>
                  </label>
                </div>
              </div>
            </aside>

            {/* Main Products Grid Column */}
            <div className="flex-1 min-w-0">
              {/* Controls bar: mobile filters button + sort dropdown */}
              <div className="flex items-center justify-between mb-6 gap-3">
                <button
                  type="button"
                  onClick={() => setShowMobileFilters((prev) => !prev)}
                  className="lg:hidden flex items-center gap-2 px-4 py-2 border border-peach rounded-xl text-sm font-medium text-charcoal hover:bg-peach-xlight transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-.293.707l-6.414 6.414A1 1 0 0 0 14 13v5a1 1 0 0 1-.447.894l-4 2.5A1 1 0 0 1 8 20.5V13a1 1 0 0 0-.293-.707L1.293 5.707A1 1 0 0 1 1 5V4z" />
                  </svg>
                  <span>Filters</span>
                </button>

                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-sm text-charcoal-light hidden sm:block">Sort by:</span>
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value)}
                    className="text-sm border border-peach-light rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-peach bg-white text-charcoal"
                  >
                    {SORT_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Horizontal Scroll Pill Filters on Mobile */}
              <div className="flex gap-2 overflow-x-auto hide-scrollbar mb-6 lg:hidden pb-1">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    activeCategory === "all"
                      ? "bg-peach-dark text-white border-peach-dark"
                      : "border-peach-light text-charcoal-light"
                  }`}
                >
                  All
                </button>
                {STORE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.slug}
                    type="button"
                    onClick={() => setActiveCategory(cat.name)}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                      activeCategory.toLowerCase() === cat.name.toLowerCase()
                        ? "bg-peach-dark text-white border-peach-dark"
                        : "border-peach-light text-charcoal-light"
                    }`}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Empty state or Product grid */}
              {filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-20 h-20 rounded-full bg-peach-xlight flex items-center justify-center mb-4">
                    <svg className="w-10 h-10 text-peach" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                  </div>
                  <h3 className="font-display text-xl font-bold text-charcoal mb-2">
                    No products found
                  </h3>
                  <p className="text-sm text-charcoal-light">
                    Try adjusting your filters or search terms.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredProducts.map((p) => (
                    <StoreProductCard key={p.id} product={p} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Shop by Category */}
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="flex items-end justify-between mb-8">
              <div>
                <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
                  Shop by Category
                </p>
                <h2 className="font-display text-3xl font-bold text-charcoal">
                  Explore Our Equipment
                </h2>
              </div>
              <Link
                href="/store"
                className="text-sm font-semibold text-peach-dark hover:text-peach-deep underline underline-offset-2 hidden sm:block"
              >
                View All
              </Link>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {STORE_CATEGORIES.map((e) => (
                <Link
                  key={e.slug}
                  href={`/store?category=${e.name}`}
                  className="group relative overflow-hidden rounded-2xl aspect-[3/4] bg-peach-xlight hover:shadow-xl transition-all duration-300"
                >
                  <img
                    src={e.image}
                    alt={e.name}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                    <p className="font-display font-bold text-base leading-tight">
                      {e.name}
                    </p>
                    <p className="text-[11px] text-white/70 mt-0.5">
                      {e.count} products
                    </p>
                    <span className="inline-block mt-2 text-[10px] font-bold tracking-wide text-peach uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                      Explore →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* Trending Now */}
          <section className="bg-warm-gray py-16">
            <div className="max-w-7xl mx-auto px-6">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
                    Curated Picks
                  </p>
                  <h2 className="font-display text-3xl font-bold text-charcoal">
                    Trending Now
                  </h2>
                </div>
                <Link
                  href="/store"
                  className="text-sm font-semibold text-peach-dark hover:text-peach-deep underline underline-offset-2 hidden sm:block"
                >
                  Shop All
                </Link>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
                {trendingProducts.map((p) => (
                  <StoreProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          </section>

          {/* Split Banners */}
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Banner 1 */}
              <div
                className="relative overflow-hidden rounded-3xl min-h-64 flex items-end p-8 bg-charcoal"
                style={{
                  backgroundImage:
                    "url(https://images.unsplash.com/photo-1504148455328-c376907d081c?w=700&h=450&fit=crop&auto=format)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10 rounded-3xl" />
                <div className="relative text-white">
                  <p className="text-xs font-bold tracking-[0.2em] text-peach uppercase mb-2">
                    Complete Kit
                  </p>
                  <h3 className="font-display text-3xl font-bold mb-3">
                    Cordless Power Sets
                  </h3>
                  <p className="text-white/70 text-sm mb-5">
                    Everything you need for industrial jobsites, in one box.
                  </p>
                  <Link
                    href="/product/BOS-GSR180LI"
                    className="inline-block px-5 py-2.5 bg-peach-dark text-white rounded-full text-sm font-semibold hover:bg-peach-deep transition-colors"
                  >
                    Shop Power Tools
                  </Link>
                </div>
              </div>

              {/* Banner 2 */}
              <div
                className="relative overflow-hidden rounded-3xl min-h-64 flex items-end p-8"
                style={{
                  backgroundImage:
                    "url(https://images.unsplash.com/photo-1544816155-12df9643f363?w=700&h=450&fit=crop&auto=format)",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10 rounded-3xl" />
                <div className="relative text-white">
                  <p className="text-xs font-bold tracking-[0.2em] text-peach uppercase mb-2">
                    Certified Protection
                  </p>
                  <h3 className="font-display text-3xl font-bold mb-3">
                    Safety & Footwear
                  </h3>
                  <p className="text-white/70 text-sm mb-5">
                    Find your certified safety gear from our curated equipment inventory.
                  </p>
                  <Link
                    href="/product/CAT-BOOT-ST"
                    className="inline-block px-5 py-2.5 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-semibold border border-white/30 hover:bg-white/35 transition-colors"
                  >
                    Shop Safety Boots
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* New Arrivals */}
          {newArrivals.length > 0 && (
            <section className="bg-peach-xlight py-16">
              <div className="max-w-7xl mx-auto px-6">
                <div className="flex items-end justify-between mb-8">
                  <div>
                    <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
                      Just In
                    </p>
                    <h2 className="font-display text-3xl font-bold text-charcoal">
                      New Arrivals
                    </h2>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  {newArrivals.map((p) => (
                    <StoreProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>
            </section>
          )}

          {/* Why Shop With Oceanic Tools Monger? */}
          <section className="max-w-7xl mx-auto px-6 py-16">
            <div className="text-center mb-12">
              <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-3">
                Our Promise
              </p>
              <h2 className="font-display text-4xl font-bold text-charcoal">
                Why Shop With Oceanic Tools Monger?
              </h2>
            </div>

            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {TRUST_BADGES.map((e) => (
                <div key={e.title} className="text-center group">
                  <div className="w-16 h-16 rounded-2xl bg-peach-light text-peach-dark flex items-center justify-center mx-auto mb-4 group-hover:bg-peach-dark group-hover:text-white transition-all duration-300">
                    {e.icon}
                  </div>
                  <h3 className="font-display font-bold text-lg text-charcoal mb-2">
                    {e.title}
                  </h3>
                  <p className="text-sm text-charcoal-light leading-relaxed">
                    {e.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Stay in the Loop (Newsletter) */}
          <section className="bg-charcoal text-white py-16">
            <div className="max-w-2xl mx-auto px-6 text-center">
              <p className="text-xs font-bold tracking-[0.25em] text-peach uppercase mb-4">
                Stay in the Loop
              </p>
              <h2 className="font-display text-4xl font-bold mb-4">
                Equipment Updates & Exclusive Offers
              </h2>
              <p className="text-white/60 text-base mb-8">
                Get new arrivals, equipment guides, and exclusive discounts delivered directly to your inbox.
              </p>
              <form className="flex gap-3 max-w-md mx-auto" onSubmit={(e) => e.preventDefault()}>
                <input
                  type="email"
                  placeholder="Enter your email address"
                  className="flex-1 px-4 py-3 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-peach"
                />
                <button
                  type="submit"
                  className="px-6 py-3 bg-peach-dark text-white rounded-xl text-sm font-semibold hover:bg-peach-deep transition-colors whitespace-nowrap"
                >
                  Subscribe
                </button>
              </form>
              <p className="text-xs text-white/30 mt-4">
                No spam. Unsubscribe anytime.
              </p>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
