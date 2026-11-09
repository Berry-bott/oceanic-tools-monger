"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStoreCart } from "@/stores/store-cart.store";

const FREE_SHIPPING_THRESHOLD = 100000;

export interface StoreCartDrawerProps {
  branches?: any[];
  storeSlug?: string;
}

export function StoreCartDrawer({}: StoreCartDrawerProps = {}) {
  const router = useRouter();
  const {
    items,
    isDrawerOpen,
    setDrawerOpen,
    removeItem,
    updateQuantity,
    reservationExpiresAt,
  } = useStoreCart();

  const [timeLeft, setTimeLeft] = useState<string>("15:00");

  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isDrawerOpen]);

  // Reservation countdown timer
  useEffect(() => {
    if (!reservationExpiresAt || items.length === 0) return;
    const interval = setInterval(() => {
      const remainingMs = reservationExpiresAt - Date.now();
      if (remainingMs <= 0) {
        setTimeLeft("00:00");
      } else {
        const mins = Math.floor(remainingMs / 60000);
        const secs = Math.floor((remainingMs % 60000) / 1000);
        setTimeLeft(`${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [reservationExpiresAt, items.length]);

  if (!isDrawerOpen) return null;

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const freeShippingDifference = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const freeShippingProgress = Math.min(100, Math.round((subtotal / FREE_SHIPPING_THRESHOLD) * 100));

  const handleCheckoutClick = () => {
    setDrawerOpen(false);
    router.push("/checkout");
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[80] bg-charcoal/50 backdrop-blur-xs transition-opacity"
        onClick={() => setDrawerOpen(false)}
      />

      {/* Drawer Container */}
      <div className="drawer-open fixed right-0 top-0 bottom-0 z-[90] w-full max-w-md bg-white shadow-2xl flex flex-col border-l border-peach-light font-sans">
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-peach-light bg-cream">
          <div>
            <h2 className="font-display text-2xl text-charcoal tracking-tight">
              Shopping Cart
              {totalCount > 0 && (
                <span className="ml-2 font-sans text-sm font-normal text-charcoal-light">
                  ({totalCount} {totalCount === 1 ? "item" : "items"})
                </span>
              )}
            </h2>
            {items.length > 0 && reservationExpiresAt && (
              <p className="text-[11px] text-peach-dark font-medium mt-0.5">
                Stock Reserved: <span className="font-mono font-bold">{timeLeft}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="p-2 text-charcoal-light hover:text-charcoal hover:bg-peach-light/50 rounded-full transition-colors"
            aria-label="Close cart"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Free Shipping Progress Meter */}
        <div className="px-6 py-3.5 bg-peach-xlight border-b border-peach-light">
          <div className="flex items-center justify-between text-xs text-charcoal mb-1.5">
            {freeShippingDifference === 0 ? (
              <span className="text-peach-deep font-bold flex items-center gap-1">
                <span>🎉</span> FREE Express Nationwide Delivery Unlocked!
              </span>
            ) : (
              <span>
                Add <strong className="text-peach-dark">₦{freeShippingDifference.toLocaleString("en-NG")}</strong> more for FREE delivery
              </span>
            )}
            <span className="text-[11px] text-charcoal-light font-mono">{freeShippingProgress}%</span>
          </div>
          <div className="w-full h-1.5 bg-peach-light rounded-full overflow-hidden">
            <div
              className="h-full bg-peach-dark transition-all duration-300 rounded-full"
              style={{ width: `${freeShippingProgress}%` }}
            />
          </div>
        </div>

        {/* Cart Item List */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center gap-4 bg-cream/40">
            <div className="w-20 h-20 rounded-full bg-peach-light/60 text-peach-dark flex items-center justify-center">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <div>
              <p className="font-display text-xl text-charcoal mb-1">
                Your cart is empty
              </p>
              <p className="text-sm text-charcoal-light">
                Discover our industrial power tools, saws, fasteners & safety equipment.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setDrawerOpen(false);
                router.push("/store");
              }}
              className="px-7 py-3 bg-peach-dark text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-peach-deep transition-colors shadow-sm"
            >
              Shop All Equipment
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-6 py-4 divide-y divide-peach-light/60">
            {items.map((item) => (
              <div key={item.productId} className="py-4 flex gap-4 items-center">
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-2xl bg-peach-xlight flex-shrink-0 overflow-hidden border border-peach-light p-1.5 flex items-center justify-center">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-peach-dark font-bold text-xs">
                      TOOL
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="flex-1 min-w-0">
                  {item.brand && (
                    <p className="text-[10px] uppercase font-bold text-peach-dark tracking-wider">
                      {item.brand}
                    </p>
                  )}
                  <h4 className="text-sm font-medium text-charcoal line-clamp-1 leading-snug">
                    {item.name}
                  </h4>
                  <p className="text-sm font-display font-bold text-charcoal mt-0.5">
                    ₦{item.sellingPrice.toLocaleString("en-NG")}
                  </p>

                  {/* Quantity Stepper */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex items-center border border-peach-light rounded-full bg-peach-xlight/50">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="w-7 h-7 flex items-center justify-center text-charcoal hover:bg-peach-light rounded-l-full transition-colors font-bold text-xs"
                        aria-label="Decrease quantity"
                      >
                        -
                      </button>
                      <span className="w-7 text-center text-xs font-medium text-charcoal">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        className="w-7 h-7 flex items-center justify-center text-charcoal hover:bg-peach-light rounded-r-full transition-colors font-bold text-xs"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeItem(item.productId)}
                      className="text-xs text-charcoal-light hover:text-red-500 transition-colors ml-auto p-1"
                      aria-label="Remove item"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer Checkout Summary */}
        {items.length > 0 && (
          <div className="border-t border-peach-light px-6 py-5 bg-white space-y-4 shadow-lg">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-charcoal-light">
                <span>Subtotal</span>
                <span className="font-display font-bold text-charcoal text-lg">
                  ₦{subtotal.toLocaleString("en-NG")}
                </span>
              </div>
              <div className="flex justify-between text-xs text-charcoal-light">
                <span>Express Delivery</span>
                <span>
                  {freeShippingDifference === 0 ? (
                    <strong className="text-peach-deep font-bold uppercase">FREE</strong>
                  ) : (
                    "Calculated at checkout"
                  )}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="py-3 px-4 border border-peach-light text-charcoal rounded-full text-xs font-bold uppercase tracking-wider hover:bg-peach-xlight transition-colors text-center"
              >
                Keep Shopping
              </button>
              <button
                type="button"
                onClick={handleCheckoutClick}
                className="py-3 px-4 bg-peach-dark text-white rounded-full text-xs font-bold uppercase tracking-wider hover:bg-peach-deep transition-colors text-center shadow-md flex items-center justify-center gap-1.5"
              >
                <span>Checkout</span>
                <span>→</span>
              </button>
            </div>

            <p className="text-[11px] text-center text-charcoal-light">
              🔒 256-Bit SSL Encrypted Checkout via Paystack
            </p>
          </div>
        )}
      </div>
    </>
  );
}
