"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyStorePayment, type StoreOrderDetails, type VerifyPaymentResult } from "@/services/store/store.service";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";

function OrderSummary({ order }: { order: StoreOrderDetails }) {
  const money = (value: number | string) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: order.currency,
      maximumFractionDigits: 2,
    }).format(Number(value));

  return (
    <div className="rounded-2xl border border-peach-light bg-peach-xlight/50 p-5 text-left">
      <h2 className="font-bold text-charcoal">What you ordered</h2>
      <div className="mt-3 divide-y divide-peach-light">
        {order.lines.map((line) => (
          <div key={line.id} className="flex justify-between gap-4 py-2.5 text-xs">
            <div>
              <p className="font-medium text-charcoal">{line.productName}</p>
              <p className="mt-0.5 text-charcoal-light">
                Qty {Number(line.quantity).toLocaleString()} × {money(line.unitPrice)}
              </p>
            </div>
            <p className="font-medium text-charcoal">{money(line.lineTotal)}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-1 border-t border-peach-light pt-3 text-xs">
        <div className="flex justify-between gap-3"><span>Subtotal</span><span>{money(order.subtotal)}</span></div>
        {Number(order.discount) > 0 && <div className="flex justify-between gap-3"><span>Discount</span><span>-{money(order.discount)}</span></div>}
        {Number(order.tax) > 0 && <div className="flex justify-between gap-3"><span>Tax</span><span>{money(order.tax)}</span></div>}
        <div className="flex justify-between gap-3"><span>Delivery</span><span>{money(order.deliveryFee)}</span></div>
        <div className="flex justify-between gap-3 border-t border-peach-light pt-2 font-bold text-charcoal"><span>Total</span><span>{money(order.total)}</span></div>
      </div>
      <div className="mt-3 border-t border-peach-light pt-3 text-xs">
        <p className="font-bold text-charcoal">
          {order.fulfillmentMethod === "COLLECTION" ? "Pickup location" : "Delivery address"}
        </p>
        <p className="mt-1 text-charcoal-light">
          {order.fulfillmentMethod === "COLLECTION"
            ? `${order.branch.name}${order.branch.address ? ` · ${order.branch.address}` : ""}`
            : order.deliveryAddress || "No delivery address recorded"}
        </p>
      </div>
    </div>
  );
}

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [verification, setVerification] = useState<VerifyPaymentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isLoading = Boolean(reference) && !verification && !errorMessage;

  useEffect(() => {
    if (!reference) {
      return;
    }

    verifyStorePayment(reference)
      .then((data) => {
        setVerification(data);
      })
      .catch((err) => {
        setErrorMessage(err instanceof Error ? err.message : "We could not verify the payment.");
      });
  }, [reference]);

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans selection:bg-peach-light selection:text-peach-deep">
      <StoreHeader />

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 py-12">
        <div className="bg-white rounded-3xl border border-peach-light p-8 sm:p-12 shadow-sm text-center space-y-6">
          {isLoading ? (
            <div className="py-12 space-y-4">
              <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-peach-dark border-t-transparent" />
              <h2 className="font-display text-2xl text-charcoal">
                Verifying Transaction…
              </h2>
              <p className="text-sm text-charcoal-light">
                Please wait while we confirm your payment with Paystack.
              </p>
            </div>
          ) : verification?.status === "DUE_AT_PICKUP" ? (
            <div className="space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-amber-700 text-2xl font-bold">
                ✓
              </div>
              <div>
                <span className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-amber-200">
                  Order Placed
                </span>
                <h1 className="font-display text-3xl sm:text-4xl text-charcoal mt-3 tracking-tight">
                  Payment Due at Pickup
                </h1>
                <p className="text-sm text-charcoal-light mt-2">
                  Your order is reserved. Pay at the selected branch when you collect it; it will be prepared after payment is recorded.
                </p>
              </div>
              <div className="bg-peach-xlight/50 rounded-2xl border border-peach-light p-6 text-left text-xs space-y-3">
                <div className="flex justify-between gap-4">
                  <span className="text-charcoal-light">Order No:</span>
                  <span className="font-mono font-bold text-charcoal">{verification.orderNumber}</span>
                </div>
                {verification.pickupLocation && (
                  <div>
                    <p className="text-charcoal-light">Pickup branch</p>
                    <p className="mt-1 font-bold text-charcoal">{verification.pickupLocation.name}</p>
                    {verification.pickupLocation.address && <p className="mt-1 text-charcoal-light">{verification.pickupLocation.address}</p>}
                  </div>
                )}
                <div className="flex justify-between border-t border-peach-light pt-3">
                  <span className="font-bold text-charcoal">Payment Status:</span>
                  <span className="font-bold text-amber-700">DUE AT PICKUP</span>
                </div>
              </div>

              {verification.order && <OrderSummary order={verification.order} />}
              <p className="text-xs text-charcoal-light leading-relaxed">
                An order summary has been queued for the email you provided. You can check the latest order status any time with your order number and checkout email.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  href="/track-order"
                  className="px-8 py-3.5 border border-peach-light text-charcoal hover:bg-peach-xlight text-xs font-bold uppercase tracking-wider rounded-full transition-all"
                >
                  Track Order
                </Link>
                <Link
                  href="/store"
                  className="px-8 py-3.5 bg-peach-dark hover:bg-peach-deep text-white text-xs font-bold uppercase tracking-wider rounded-full transition-all shadow-md"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          ) : verification?.status === "SUCCEEDED" ? (
            <div className="space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-peach-light text-peach-deep text-2xl font-bold shadow-xs">
                ✓
              </div>

              <div>
                <span className="bg-peach-light text-peach-deep text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider border border-peach/30">
                  Order Confirmed
                </span>
                <h1 className="font-display text-3xl sm:text-4xl text-charcoal mt-3 tracking-tight">
                  Thank You for Your Order!
                </h1>
                <p className="text-sm text-charcoal-light mt-1.5">
                  Your Oceanic Tools Monger order is being picked and prepared for dispatch.
                </p>
              </div>

              <div className="bg-peach-xlight/50 rounded-2xl border border-peach-light p-6 text-left text-xs space-y-2.5">
                <div className="flex justify-between">
                  <span className="text-charcoal-light">Waybill / Order No:</span>
                  <span className="font-mono font-bold text-charcoal">{verification.orderNumber || reference}</span>
                </div>
                {verification.paidAt && (
                  <div className="flex justify-between">
                    <span className="text-charcoal-light">Timestamp:</span>
                    <span className="text-charcoal font-medium">{new Date(verification.paidAt).toLocaleString("en-NG")}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2.5 border-t border-peach-light">
                  <span className="text-charcoal font-bold">Payment Status:</span>
                  <span className="text-peach-deep font-bold">PAID & ALLOCATED</span>
                </div>
              </div>

              {verification.order && <OrderSummary order={verification.order} />}
              <p className="text-xs text-charcoal-light leading-relaxed">
                An order summary has been queued for the email you provided. You can check the latest order status any time with your order number and checkout email.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Link
                  href="/track-order"
                  className="px-8 py-3.5 bg-peach-dark hover:bg-peach-deep text-white text-xs font-bold uppercase tracking-wider rounded-full transition-all shadow-md"
                >
                  Track Live Shipment
                </Link>
                <Link
                  href="/store"
                  className="px-8 py-3.5 border border-peach-light text-charcoal hover:bg-peach-xlight text-xs font-bold uppercase tracking-wider rounded-full transition-all"
                >
                  Continue Shopping
                </Link>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600 text-2xl font-bold">
                ✕
              </div>
              <h2 className="font-display text-2xl text-charcoal">
                {verification?.status === "PENDING" ? "Payment Is Processing" : "Payment Not Confirmed"}
              </h2>
              <p className="text-sm text-charcoal-light">
                {errorMessage ||
                  (verification?.status === "PENDING"
                    ? "The payment provider has not confirmed this payment yet. Check your order status again shortly."
                    : "We could not confirm the transaction. If you were debited, contact our team before trying again.")}
              </p>
              {verification?.order && (
                <>
                  <div className="rounded-2xl border border-peach-light bg-peach-xlight/50 p-4 text-left text-xs">
                    <span className="text-charcoal-light">Order number: </span>
                    <span className="font-mono font-bold text-charcoal">{verification.orderNumber}</span>
                  </div>
                  <OrderSummary order={verification.order} />
                </>
              )}
              <div className="pt-4 flex gap-3 justify-center">
                {verification?.order && (
                  <Link
                    href="/track-order"
                    className="px-6 py-3 border border-peach-light text-charcoal rounded-full text-xs font-bold uppercase tracking-wider hover:bg-peach-xlight transition-all"
                  >
                    Track Order
                  </Link>
                )}
                <Link
                  href="/checkout"
                  className="px-6 py-3 bg-peach-dark hover:bg-peach-deep text-white text-xs font-bold uppercase tracking-wider rounded-full transition-all shadow-md"
                >
                  Try Again
                </Link>
                <Link
                  href="/store"
                  className="px-6 py-3 border border-peach-light text-charcoal rounded-full text-xs font-bold uppercase tracking-wider hover:bg-peach-xlight transition-all"
                >
                  Back to Shop
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>

      <StoreFooter />
    </div>
  );
}

export default function ConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-cream flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-peach-dark border-t-transparent" />
        </div>
      }
    >
      <ConfirmationContent />
    </Suspense>
  );
}
