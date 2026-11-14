"use client";

import Link from "next/link";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { StoreProductCard } from "@/components/storefront/store-product-card";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { useStoreCart } from "@/stores/store-cart.store";
import { TOOLS_PRODUCTS } from "@/data/tools-catalog";

const STANDARD_DELIVERY_FEE = 4500;
const FREE_SHIPPING_THRESHOLD = 100000;

export default function CartPage() {
  const { items, removeItem, updateQuantity } = useStoreCart();

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const isFreeDelivery = subtotal >= FREE_SHIPPING_THRESHOLD;
  const deliveryFee = isFreeDelivery ? 0 : STANDARD_DELIVERY_FEE;
  const total = subtotal + (items.length > 0 ? deliveryFee : 0);
  const remainingForFree = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  const related = TOOLS_PRODUCTS.filter(
    (t) => !items.some((i) => i.productId === t.id)
  ).slice(0, 4);

  return (
    <div className="min-h-screen bg-white text-charcoal flex flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] sm:pb-0 font-sans">
      <StoreHeader />

      <main className="flex-1 sm:pb-16">
        {items.length === 0 ? (
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-20 flex flex-col items-center text-center gap-6">
            <div className="w-24 h-24 rounded-full bg-peach-xlight flex items-center justify-center">
              <svg className="w-12 h-12 text-peach" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0" />
              </svg>
            </div>
            <h1 className="font-display text-3xl font-bold text-charcoal">
              Your cart is empty
            </h1>
            <p className="text-charcoal-light max-w-sm">
              Explore our industrial power tools, saws, fasteners & safety equipment and add tools to your order.
            </p>
            <Link
              href="/store"
              className="px-8 py-3.5 bg-peach-dark text-white rounded-full font-semibold hover:bg-peach-deep transition-colors"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <div>
            {/* Header Banner */}
            <div className="bg-peach-xlight border-b border-peach-light">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
                <h1 className="font-display text-3xl font-bold text-charcoal">
                  Shopping Cart
                  <span className="ml-3 text-lg font-normal text-charcoal-light not-italic">
                    ({totalCount} {totalCount === 1 ? "item" : "items"})
                  </span>
                </h1>
              </div>
            </div>

            {/* Cart Body */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 grid lg:grid-cols-3 gap-6 sm:gap-10 items-start">
              {/* Item List */}
              <div className="lg:col-span-2 space-y-4">
                {items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex gap-4 p-4 bg-white border border-peach-light rounded-2xl hover:border-peach/50 transition-colors"
                  >
                    <div className="w-24 h-24 rounded-xl overflow-hidden bg-peach-xlight flex-shrink-0 flex items-center justify-center p-1">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.src = "/workshop-drill.jpg";
                          }}
                        />
                      ) : (
                        <span className="text-peach-dark font-bold text-xs">TOOLS</span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <div>
                          {item.brand && (
                            <p className="text-[11px] text-peach-dark font-semibold tracking-wide uppercase">
                              {item.brand}
                            </p>
                          )}
                          <Link
                            href={`/product/${item.sku || item.productId}`}
                            className="font-semibold text-charcoal hover:text-peach-dark transition-colors text-sm leading-snug line-clamp-2"
                          >
                            {item.name}
                          </Link>
                          {item.unit && (
                            <p className="text-xs text-charcoal-light mt-0.5">{item.unit}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.productId)}
                          className="p-1.5 text-charcoal-light hover:text-red-500 transition-colors ml-2"
                          aria-label="Remove"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {typeof item.available === "number" && (
                        <p className={`mt-2 text-xs font-semibold ${item.available <= 0 ? "text-red-600" : item.quantity > item.available ? "text-amber-700" : "text-emerald-700"}`}>
                          {item.available <= 0 ? "Out of stock" : item.quantity > item.available ? `Only ${item.available} available` : `${item.available} available`}
                        </p>
                      )}

                      <div className="flex items-center justify-between mt-3">
                        <div className="flex items-center border border-peach-light rounded-xl overflow-hidden">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="w-9 h-9 flex items-center justify-center text-charcoal hover:bg-peach-xlight transition-colors"
                          >
                            −
                          </button>
                          <span className="w-10 text-center text-sm font-semibold">
                            {item.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            disabled={typeof item.available === "number" && item.quantity >= item.available}
                            className="w-9 h-9 flex items-center justify-center text-charcoal hover:bg-peach-xlight transition-colors"
                          >
                            +
                          </button>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-charcoal">
                            ₦{(item.sellingPrice * item.quantity).toLocaleString("en-NG")}
                          </p>
                          {item.quantity > 1 && (
                            <p className="text-xs text-charcoal-light">
                              ₦{item.sellingPrice.toLocaleString("en-NG")} each
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Coupon Code Box */}
                <div className="p-4 border border-peach-light rounded-2xl bg-white">
                  <p className="text-sm font-semibold text-charcoal mb-3">
                    Have a corporate purchase order or coupon code?
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter code (e.g. OCEANIC10)"
                      className="flex-1 px-4 py-2.5 border border-peach-light rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-peach"
                    />
                    <button
                      type="button"
                      className="px-5 py-2.5 bg-peach-dark text-white rounded-xl text-sm font-semibold hover:bg-peach-deep transition-colors"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              {/* Order Summary Sticky Card */}
              <div className="lg:sticky lg:top-24">
                <div className="bg-cream border border-peach-light rounded-2xl p-6 space-y-4 shadow-xs">
                  <h2 className="font-display text-xl font-bold text-charcoal">
                    Order Summary
                  </h2>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-charcoal-light">
                      <span>Subtotal</span>
                      <span className="text-charcoal font-medium">
                        ₦{subtotal.toLocaleString("en-NG")}
                      </span>
                    </div>

                    <div className="flex justify-between text-charcoal-light">
                      <span>Delivery</span>
                      <span className={isFreeDelivery ? "text-green-600 font-semibold" : "text-charcoal font-medium"}>
                        {isFreeDelivery ? "FREE" : `₦${deliveryFee.toLocaleString("en-NG")}`}
                      </span>
                    </div>

                    {remainingForFree > 0 && (
                      <div className="bg-peach-xlight rounded-xl px-3 py-2.5 text-xs text-charcoal-light">
                        Add <span className="font-bold text-peach-dark">₦{remainingForFree.toLocaleString("en-NG")}</span> more for free delivery
                        <div className="mt-1.5 h-1.5 bg-peach-light rounded-full overflow-hidden">
                          <div
                            className="h-full bg-peach-dark rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-peach-light pt-4 flex justify-between items-baseline">
                    <span className="font-bold text-charcoal">Total</span>
                    <span className="text-2xl font-bold text-charcoal font-display">
                      ₦{total.toLocaleString("en-NG")}
                    </span>
                  </div>

                  <Link
                    href="/checkout"
                    className="block w-full py-4 bg-peach-dark text-white rounded-full text-center font-bold text-sm hover:bg-peach-deep transition-colors shadow-md"
                  >
                    Proceed to Checkout
                  </Link>

                  <Link
                    href="/store"
                    className="block text-center text-sm text-charcoal-light hover:text-peach-dark underline underline-offset-2"
                  >
                    Continue Shopping
                  </Link>

                  <div className="flex items-center justify-center gap-4 pt-2 text-xs text-charcoal-light">
                    <span>🔒 Secure checkout</span>
                    <span>💳 Paystack</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Related Tools Section */}
            {related.length > 0 && (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-10">
                <h2 className="font-display text-2xl font-bold text-charcoal mb-6">
                  You May Also Like
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                  {related.map((p) => (
                    <StoreProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <StoreCartDrawer />
      <MobileBottomNav />
      <StoreFooter />
    </div>
  );
}
