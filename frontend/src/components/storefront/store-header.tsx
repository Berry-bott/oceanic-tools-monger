"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStoreCart } from "@/stores/store-cart.store";
import { useCustomerAuth } from "@/stores/customer-auth.store";
import { CustomerProfileDropdown } from "./customer-profile-dropdown";

const NAV_LINKS = [
  { label: "Shop", href: "/store" },
  { label: "Power Tools", href: "/store?category=Power Tools" },
  { label: "Saws & Cutters", href: "/store?category=Saw & Cutting Tools" },
  { label: "Safety & Boots", href: "/store?category=Safety & Boots" },
  { label: "Fasteners & Nails", href: "/store?category=Fasteners & Nails" },
  { label: "New Arrivals", href: "/store?badge=NEW" },
  { label: "Deals", href: "/store?badge=BEST SELLER" },
];

export interface StoreHeaderProps {
  branches?: any[];
  storeSlug?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
  selectedCategory?: string;
  onCategorySelect?: (c: string) => void;
}

export function StoreHeader({}: StoreHeaderProps = {}) {
  const router = useRouter();
  const { items, setDrawerOpen } = useStoreCart();
  const { customer } = useCustomerAuth();
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  const [isScrolled, setIsScrolled] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 40);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/store?search=${encodeURIComponent(searchQuery.trim())}`);
      setIsSearchOpen(false);
      setSearchQuery("");
    }
  };

  return (
    <>
      {/* Announcement Bar */}
      <div className="overflow-hidden bg-charcoal py-2 text-white font-medium" role="region" aria-label="Store announcement">
        <div className="announcement-marquee-track flex w-max whitespace-nowrap text-xs tracking-wide">
          <span className="px-6">Free delivery on orders over ₦100,000 &nbsp;•&nbsp; Secure payment &nbsp;•&nbsp; Shop authentic industrial tools with Oceanic Tools Monger</span>
          <span className="px-6" aria-hidden="true">Free delivery on orders over ₦100,000 &nbsp;•&nbsp; Secure payment &nbsp;•&nbsp; Shop authentic industrial tools with Oceanic Tools Monger</span>
        </div>
      </div>

      {/* Main Header */}
      <header
        className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${
          isScrolled ? "shadow-md" : "border-b border-peach-light"
        }`}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 h-16 flex items-center gap-2 sm:gap-4">
          {/* Logo with public folder image */}
          <Link href="/" className="min-w-0 shrink flex items-center gap-1.5 sm:gap-2 group sm:mr-4">
            <img
              src="/oceantoolslogo.png"
              alt="Oceanic Tools Monger"
              className="h-9 max-w-[44px] min-[380px]:h-10 min-[380px]:max-w-none sm:h-11 md:h-12 w-auto object-contain shrink-0 transition-transform duration-200 group-hover:scale-105"
            />
            <div className="flex min-w-0 flex-col justify-center">
              <span className="whitespace-nowrap font-display text-lg min-[380px]:text-xl sm:text-2xl md:text-[26px] font-black tracking-tight text-charcoal leading-none">
                Oceanic
              </span>
              <span className="whitespace-nowrap text-[8px] min-[380px]:text-[9px] sm:text-[10px] md:text-[11px] font-bold uppercase tracking-[0.18em] min-[380px]:tracking-[0.22em] text-peach-dark font-sans leading-none mt-1">
                Tools Monger
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1 flex-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="px-3 py-2 text-sm font-medium text-charcoal-light hover:text-peach-dark hover:bg-peach-xlight rounded-lg transition-colors duration-150 whitespace-nowrap"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right Action Icons */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 ml-auto">
            {/* Search */}
            <button
              type="button"
              onClick={() => setIsSearchOpen((prev) => !prev)}
              className="p-2 text-charcoal hover:text-peach-dark hover:bg-peach-xlight rounded-lg transition-colors"
              aria-label="Search"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
            </button>

            {/* Track Order */}
            <Link
              href="/track-order"
              className="p-2 text-charcoal hover:text-peach-dark hover:bg-peach-xlight rounded-lg transition-colors hidden sm:block"
              aria-label="Track Order"
              title="Track Order"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V3.75m0 3.75h3.75m-3.75 0V18.75m-6.75-9.75h6.75" />
              </svg>
            </Link>

            {/* Wishlist */}
            <Link
              href="/store"
              className="relative p-2 text-charcoal hover:text-peach-dark hover:bg-peach-xlight rounded-lg transition-colors hidden sm:block"
              aria-label="Wishlist"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                />
              </svg>
            </Link>

            {/* Cart Button */}
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="relative p-2 text-charcoal hover:text-peach-dark hover:bg-peach-xlight rounded-lg transition-colors"
              aria-label="Cart"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
              </svg>
              {totalItemCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-peach-dark text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {totalItemCount > 9 ? "9+" : totalItemCount}
                </span>
              )}
            </button>

            {/* Customer Account & Profile Dropdown (Positioned after Cart) */}
            <CustomerProfileDropdown />

            {/* Keep the mobile menu at the far right of the header */}
            <button
              type="button"
              className="lg:hidden shrink-0 p-2 text-charcoal"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMobileMenuOpen}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                {isMobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Collapsible Search */}
        {isSearchOpen && (
          <div className="border-t border-peach-light bg-cream px-4 py-3">
            <form onSubmit={handleSearchSubmit} className="max-w-2xl mx-auto flex gap-2">
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search for drills, saws, boots, fasteners, brands…"
                className="flex-1 px-4 py-2.5 rounded-xl border border-peach/40 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-peach"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-peach-dark text-white rounded-xl text-sm font-semibold hover:bg-peach-deep transition-colors"
              >
                Search
              </button>
            </form>
          </div>
        )}

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-peach-light bg-white px-4 py-4 space-y-1">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                onClick={() => setIsMobileMenuOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-charcoal hover:text-peach-dark hover:bg-peach-xlight rounded-lg transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-peach-light flex flex-col gap-2 px-3">
              <Link
                href="/account"
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex items-center gap-2 text-sm font-semibold text-charcoal hover:text-peach-dark py-1"
              >
                <svg className="w-4 h-4 text-peach-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                {customer ? `Account (${customer.firstName || customer.name || customer.email})` : "Customer Sign In / Register"}
              </Link>
              <div className="flex gap-4 pt-1">
                <Link
                  href="/track-order"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-xs text-charcoal-light hover:text-peach-dark"
                >
                  Track Order
                </Link>
                <Link
                  href="/store"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="text-xs text-charcoal-light hover:text-peach-dark"
                >
                  Shop Products
                </Link>
              </div>
            </div>
          </div>
        )}
      </header>
    </>
  );
}
