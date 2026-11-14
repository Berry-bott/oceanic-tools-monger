"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCustomerAuth } from "@/stores/customer-auth.store";

export function CustomerProfileDropdown() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab") || "orders";
  const isAccountPage = pathname === "/account";

  const { customer, email, isAuthenticated, logout } = useCustomerAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSignOut = async () => {
    setIsOpen(false);
    await logout();
    router.push("/account");
  };

  // If not logged in, clicking goes straight to simple login
  if (!isAuthenticated || !customer) {
    return (
      <Link
        href="/account"
        className="flex items-center gap-1.5 px-3 py-1.5 text-charcoal hover:text-peach-dark hover:bg-peach-xlight/80 rounded-xl transition-all duration-150 border border-slate-200/70 hover:border-peach-light/60 text-xs font-bold"
        aria-label="Sign In"
        title="Customer Sign In"
      >
        <svg className="w-4 h-4 text-charcoal-light" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z"
          />
        </svg>
        <span>Sign In</span>
      </Link>
    );
  }

  const initial = customer.name?.charAt(0).toUpperCase() || customer.firstName?.charAt(0).toUpperCase() || "C";
  const displayName = customer.firstName || customer.name?.split(" ")[0] || "Account";

  const isTabActive = (tab: string) => isAccountPage && currentTab === tab;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger Button in Header (Last after Cart) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-2xl transition-all duration-150 border active:scale-[0.98] ${
          isOpen
            ? "bg-peach-xlight/80 border-peach-light text-peach-dark ring-2 ring-peach-light/30"
            : "text-charcoal hover:text-peach-dark hover:bg-peach-xlight/60 border-slate-200/70 hover:border-peach-light/60 bg-white shadow-2xs"
        }`}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label="Customer profile menu"
      >
        {/* Avatar */}
        <div className="relative w-8 h-8 rounded-full overflow-hidden bg-peach-dark text-white font-bold text-xs flex items-center justify-center ring-2 ring-peach-light/90 shadow-2xs shrink-0">
          {customer.avatarUrl ? (
            <img
              src={customer.avatarUrl}
              alt={customer.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <span>{initial}</span>
          )}
          <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-1 ring-white" />
        </div>

        {/* Name (desktop) */}
        <span className="hidden md:inline text-xs font-bold text-charcoal max-w-[90px] truncate">
          {displayName}
        </span>

        {/* Chevron */}
        <svg
          className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? "rotate-180 text-peach-dark" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* DROPDOWN MENU */}
      {isOpen && (
        <div className="absolute right-0 mt-2.5 w-76 sm:w-84 bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(15,23,42,0.18)] border border-slate-200/90 py-2.5 z-50 animate-in fade-in zoom-in-95 duration-150 overflow-hidden font-sans">
          {/* Header Card: Avatar + Name + Email */}
          <div className="px-4 py-3.5 mx-2 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100/70 border border-slate-200/60 mb-2">
            <div className="flex items-center gap-3">
              <div className="relative w-11 h-11 rounded-2xl overflow-hidden bg-peach-dark text-white font-black text-base flex items-center justify-center ring-2 ring-peach-light shadow-2xs shrink-0">
                {customer.avatarUrl ? (
                  <img
                    src={customer.avatarUrl}
                    alt={customer.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span>{initial}</span>
                )}
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full ring-1.5 ring-white" />
              </div>

              {/* User Identity Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <h4 className="text-xs sm:text-sm font-extrabold text-charcoal truncate leading-tight">
                    {customer.name}
                  </h4>
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 shrink-0">
                    Active
                  </span>
                </div>
                <p className="text-[11px] text-charcoal-light truncate mt-0.5 font-medium">
                  {email || customer.email}
                </p>
              </div>
            </div>
          </div>

          {/* Menu Items (Purchases, Account Statement, then Profile Setting last) */}
          <div className="px-2 space-y-1">
            {/* 1. Purchases */}
            <Link
              href="/account?tab=orders"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all group ${
                isTabActive("orders")
                  ? "bg-peach-xlight text-peach-dark ring-1 ring-peach-light/80 shadow-2xs"
                  : "text-charcoal hover:bg-slate-100/80 hover:text-peach-dark"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isTabActive("orders")
                    ? "bg-peach-dark text-white"
                    : "bg-slate-100 group-hover:bg-peach-light/40 text-charcoal-light group-hover:text-peach-dark"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="leading-snug">Purchases</span>
                  {isTabActive("orders") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-peach-dark" />
                  )}
                </div>
                <span className="block text-[10px] text-charcoal-light font-normal">Order history & email receipts</span>
              </div>
              <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-peach-dark transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* 2. Account Statement */}
            <Link
              href="/account?tab=statement"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all group ${
                isTabActive("statement")
                  ? "bg-peach-xlight text-peach-dark ring-1 ring-peach-light/80 shadow-2xs"
                  : "text-charcoal hover:bg-slate-100/80 hover:text-peach-dark"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isTabActive("statement")
                    ? "bg-peach-dark text-white"
                    : "bg-slate-100 group-hover:bg-peach-light/40 text-charcoal-light group-hover:text-peach-dark"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="leading-snug">Account Statement</span>
                  {isTabActive("statement") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-peach-dark" />
                  )}
                </div>
                <span className="block text-[10px] text-charcoal-light font-normal">Balances, invoices & credits</span>
              </div>
              <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-peach-dark transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            {/* 3. Profile Setting (Last item in dropdown menu) */}
            <Link
              href="/account?tab=profile"
              onClick={() => setIsOpen(false)}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-all group ${
                isTabActive("profile")
                  ? "bg-peach-xlight text-peach-dark ring-1 ring-peach-light/80 shadow-2xs"
                  : "text-charcoal hover:bg-slate-100/80 hover:text-peach-dark"
              }`}
            >
              <div
                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                  isTabActive("profile")
                    ? "bg-peach-dark text-white"
                    : "bg-slate-100 group-hover:bg-peach-light/40 text-charcoal-light group-hover:text-peach-dark"
                }`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="leading-snug">Profile Setting</span>
                  {isTabActive("profile") && (
                    <span className="w-1.5 h-1.5 rounded-full bg-peach-dark" />
                  )}
                </div>
                <span className="block text-[10px] text-charcoal-light font-normal">Contact info, photo & address</span>
              </div>
              <svg className="w-3.5 h-3.5 text-slate-300 group-hover:text-peach-dark transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>

          {/* Divider */}
          <div className="border-t border-slate-100 my-1.5 mx-2" />

          {/* Sign Out Button */}
          <div className="px-2">
            <button
              type="button"
              onClick={handleSignOut}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-xs font-bold text-rose-600 hover:bg-rose-50/90 transition-colors group"
            >
              <div className="w-8 h-8 rounded-xl bg-rose-50 group-hover:bg-rose-100/70 flex items-center justify-center shrink-0 transition-colors">
                <svg className="w-4 h-4 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </div>
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
