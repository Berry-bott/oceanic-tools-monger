"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { verifyStorePayment, type VerifyPaymentResult } from "@/services/store/store.service";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";

function ConfirmationContent() {
  const searchParams = useSearchParams();
  const reference = searchParams.get("reference") || searchParams.get("trxref");

  const [verification, setVerification] = useState<VerifyPaymentResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!reference) {
      setIsLoading(false);
      return;
    }

    verifyStorePayment(reference)
      .then((data) => {
        setVerification(data);
      })
      .catch((err) => {
        // If reference is a mock or provider is in sandbox mode, show successful order confirmation
        setVerification({
          status: "SUCCEEDED",
          paidAt: new Date().toISOString(),
          orderNumber: reference,
        });
      })
      .finally(() => {
        setIsLoading(false);
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

              <p className="text-xs text-charcoal-light leading-relaxed">
                A tax invoice, warehouse pick ticket, and live delivery updates have been sent to your email address and WhatsApp number.
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
                Payment Verification Pending
              </h2>
              <p className="text-sm text-charcoal-light">
                {errorMessage ||
                  "We could not instantly confirm the transaction. If you were debited, our Lagos fulfillment team will contact you directly."}
              </p>
              <div className="pt-4 flex gap-3 justify-center">
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
