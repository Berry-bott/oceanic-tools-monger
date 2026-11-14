import { Suspense } from "react";
import { AccountClient } from "./account-client";

export const metadata = {
  title: "Customer Account & Purchases | Oceanic Tools Monger",
  description: "Sign in to view your equipment purchases, order tracking, and email receipts.",
};

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#FAF7F2] flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <div className="w-12 h-12 rounded-full border-2 border-peach-dark border-t-transparent animate-spin mx-auto" />
            <p className="text-sm font-semibold text-charcoal">Connecting to Oceanic Portal...</p>
          </div>
        </div>
      }
    >
      <AccountClient />
    </Suspense>
  );
}
