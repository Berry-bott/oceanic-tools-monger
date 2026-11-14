"use client";

import { useState } from "react";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";
import { trackStoreOrder, type StoreOrderDetails } from "@/services/store/store.service";

const label = (value: string) => value.toLowerCase().replaceAll("_", " ");
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const formatMoney = (value: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<StoreOrderDetails | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setOrder(null);
    setIsLoading(true);
    try {
      setOrder(await trackStoreOrder({ orderNumber: orderNumber.trim(), email: email.trim() }));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The order could not be found.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans">
      <StoreHeader />

      <main className="flex-1 pb-16">
        <div className="bg-peach-xlight border-b border-peach-light">
          <div className="max-w-3xl mx-auto px-6 py-10">
            <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
              Order updates
            </p>
            <h1 className="font-display text-4xl font-bold text-charcoal">
              Track Your Order
            </h1>
            <p className="mt-2 text-sm text-charcoal-light">
              Look up your order with the order number and the email used at checkout.
            </p>
          </div>
        </div>

        <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
          <div className="bg-white rounded-2xl border border-peach-light p-6 shadow-xs">
            <form onSubmit={(event) => void handleSubmit(event)} className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-xs font-medium text-charcoal">
                Order number
                <input
                  required
                  maxLength={40}
                  value={orderNumber}
                  onChange={(event) => setOrderNumber(event.target.value)}
                  placeholder="e.g. WEB-20261113-AB12CD34"
                  className="w-full px-4 py-3 border border-peach-light rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-peach"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-medium text-charcoal">
                Checkout email
                <input
                  required
                  type="email"
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-3 border border-peach-light rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-peach"
                />
              </label>
              <button
                type="submit"
                disabled={isLoading}
                className="sm:col-span-2 px-6 py-3 bg-peach-dark text-white rounded-xl font-semibold text-sm hover:bg-peach-deep transition-colors disabled:opacity-60"
              >
                {isLoading ? "Looking up order..." : "Find order"}
              </button>
            </form>
            {error && (
              <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>

          {order && (
            <div className="bg-white rounded-2xl border border-peach-light p-6 space-y-6 shadow-xs">
              <div className="flex flex-wrap justify-between items-start gap-3 border-b border-peach-light pb-4">
                <div>
                  <p className="text-xs text-charcoal-light uppercase tracking-wide font-semibold">Order reference</p>
                  <p className="font-bold text-charcoal font-mono">{order.number}</p>
                  <p className="mt-1 text-xs text-charcoal-light">Placed {formatDate(order.createdAt)}</p>
                </div>
                <span className="px-3 py-1 bg-peach-xlight text-peach-dark text-xs font-bold rounded-full capitalize">
                  {label(order.status)}
                </span>
              </div>

              <section>
                <h2 className="font-display text-lg font-bold">Items ordered</h2>
                <div className="mt-3 divide-y divide-peach-light">
                  {order.lines.map((line) => (
                    <div key={line.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                      <div>
                        <p className="font-medium">{line.productName}</p>
                        <p className="text-xs text-charcoal-light">
                          SKU {line.sku} · Qty {Number(line.quantity).toLocaleString()} × {formatMoney(line.unitPrice, order.currency)}
                        </p>
                      </div>
                      <p className="font-semibold">{formatMoney(line.lineTotal, order.currency)}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="grid gap-5 border-t border-peach-light pt-4 sm:grid-cols-2">
                <div>
                  <h2 className="font-display text-lg font-bold">Fulfillment</h2>
                  <p className="mt-2 text-sm capitalize">{label(order.fulfillmentMethod)}</p>
                  {order.fulfillmentMethod === "COLLECTION" ? (
                    <p className="mt-1 text-sm text-charcoal-light">
                      {order.branch.name}{order.branch.address ? ` · ${order.branch.address}` : ""}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-charcoal-light">{order.deliveryAddress || "No delivery address recorded"}</p>
                  )}
                  <p className="mt-3 text-xs text-charcoal-light">
                    The store updates this status as the order is processed. Carrier GPS tracking is not available here.
                  </p>
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold">Payment</h2>
                  {order.payments.map((payment) => (
                    <div key={payment.reference} className="mt-2 text-sm">
                      <p className="capitalize">{label(payment.status)} · {label(payment.method)}</p>
                      <p className="text-xs text-charcoal-light">
                        {formatMoney(payment.amount, order.currency)}
                        {payment.paidAt ? ` · Paid ${formatDate(payment.paidAt)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="ml-auto max-w-xs space-y-1 border-t border-peach-light pt-4 text-sm">
                <div className="flex justify-between gap-4"><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currency)}</span></div>
                {Number(order.discount) > 0 && <div className="flex justify-between gap-4"><span>Discount</span><span>-{formatMoney(order.discount, order.currency)}</span></div>}
                {Number(order.tax) > 0 && <div className="flex justify-between gap-4"><span>Tax</span><span>{formatMoney(order.tax, order.currency)}</span></div>}
                <div className="flex justify-between gap-4"><span>Delivery</span><span>{formatMoney(order.deliveryFee, order.currency)}</span></div>
                <div className="flex justify-between gap-4 border-t border-peach-light pt-2 font-bold"><span>Total</span><span>{formatMoney(order.total, order.currency)}</span></div>
              </section>
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
