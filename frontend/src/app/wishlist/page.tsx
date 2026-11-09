"use client";

import { useState } from "react";
import Link from "next/link";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreProductCard } from "@/components/storefront/store-product-card";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { TOOLS_PRODUCTS } from "@/data/tools-catalog";

export default function WishlistPage() {
  // Use first 4 products as sample or popular items to display if empty
  const [wishlistItems] = useState(TOOLS_PRODUCTS.slice(0, 4));

  return (
    <div className="min-h-screen bg-white text-charcoal flex flex-col font-sans">
      <StoreHeader />

      <main className="flex-1 pb-16">
        <div className="bg-peach-xlight border-b border-peach-light">
          <div className="max-w-7xl mx-auto px-6 py-10">
            <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
              Saved Equipment
            </p>
            <h1 className="font-display text-4xl font-bold text-charcoal">
              My Wishlist
              <span className="ml-3 text-lg font-normal text-charcoal-light not-italic">
                ({wishlistItems.length} items)
              </span>
            </h1>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-6 py-10">
          {wishlistItems.length === 0 ? (
            <div className="flex flex-col items-center py-24 gap-5 text-center">
              <div className="w-20 h-20 rounded-full bg-peach-xlight flex items-center justify-center">
                <svg className="w-10 h-10 text-peach" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                  />
                </svg>
              </div>
              <h2 className="font-display text-2xl font-bold text-charcoal">
                Your wishlist is empty
              </h2>
              <p className="text-charcoal-light text-sm max-w-sm">
                Save equipment and industrial parts by clicking the heart icon on any product card.
              </p>
              <Link
                href="/store"
                className="px-8 py-3.5 bg-peach-dark text-white rounded-full font-semibold hover:bg-peach-deep transition-colors"
              >
                Browse Products
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
              {wishlistItems.map((product) => (
                <StoreProductCard key={product.id} product={product} />
              ))}
            </div>
          )}
        </div>
      </main>

      <StoreCartDrawer />
      <MobileBottomNav />
      <StoreFooter />
    </div>
  );
}
