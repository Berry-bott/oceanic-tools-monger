"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStoreCart } from "@/stores/store-cart.store";

export function MobileBottomNav() {
  const pathname = usePathname();
  const { items, setDrawerOpen } = useStoreCart();
  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Hide on checkout pages
  if (pathname.startsWith("/checkout")) {
    return null;
  }

  const navItems = [
    {
      to: "/",
      label: "Home",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" />
        </svg>
      ),
    },
    {
      to: "/store",
      label: "Shop",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7V5a2 2 0 0 0-4 0v2M8 7V5a2 2 0 0 0-4 0v2" />
        </svg>
      ),
    },
    {
      to: "/wishlist",
      label: "Saved",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
          />
        </svg>
      ),
    },
    {
      to: "/cart",
      label: "Cart",
      isCart: true,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
    },
    {
      to: "/track-order",
      label: "Track",
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.25V3.75m0 3.75h3.75m-3.75 0V18.75m-6.75-9.75h6.75" />
        </svg>
      ),
    },
  ];

  return (
    <nav className="sm:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-peach-light safe-bottom font-sans">
      <div className="flex">
        {navItems.map((item) => {
          const isActive = pathname === item.to;

          if (item.isCart) {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setDrawerOpen(true)}
                className={`relative flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                  isActive ? "text-peach-dark" : "text-charcoal-light"
                }`}
              >
                {item.icon}
                <span>{item.label}</span>
                {totalItemCount > 0 && (
                  <span className="absolute top-1.5 right-6 w-4 h-4 bg-peach-dark text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {totalItemCount > 9 ? "9+" : totalItemCount}
                  </span>
                )}
              </button>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.to}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-peach-dark" : "text-charcoal-light"
              }`}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
