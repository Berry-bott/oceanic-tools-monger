"use client";

import { useState } from "react";
import Link from "next/link";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import { StoreCartDrawer } from "@/components/storefront/store-cart-drawer";

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [hasSearched, setHasSearched] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (orderNumber.trim()) {
      setHasSearched(true);
    }
  };

  const steps = [
    { label: "Order Placed", date: "Today · 10:32 AM", done: true },
    { label: "Confirmed & Invoiced", date: "Today · 10:45 AM", done: true },
    { label: "Warehouse Allocation", date: "Today · 2:00 PM", done: true },
    { label: "Heavy Freight Shipped", date: "Estimated Tomorrow", done: false, active: true },
    { label: "Delivered to Jobsite", date: "Estimated 2 Business Days", done: false },
  ];

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans">
      <StoreHeader />

      <main className="flex-1 pb-16">
        <div className="bg-peach-xlight border-b border-peach-light">
          <div className="max-w-2xl mx-auto px-6 py-10">
            <p className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase mb-2">
              Real-time Logistics
            </p>
            <h1 className="font-display text-4xl font-bold text-charcoal">
              Track Your Order
            </h1>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-6 py-10 space-y-6">
          <div className="bg-white rounded-2xl border border-peach-light p-6 shadow-xs">
            <form onSubmit={handleSubmit} className="flex gap-3">
              <input
                value={orderNumber}
                onChange={(e) => {
                  setOrderNumber(e.target.value);
                  setHasSearched(false);
                }}
                placeholder="Enter waybill or order number e.g. ORD-BOSCH180"
                className="flex-1 px-4 py-3 border border-peach-light rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-peach"
              />
              <button
                type="submit"
                className="px-6 py-3 bg-peach-dark text-white rounded-xl font-semibold text-sm hover:bg-peach-deep transition-colors"
              >
                Track
              </button>
            </form>
          </div>

          {hasSearched && (
            <div className="bg-white rounded-2xl border border-peach-light p-6 space-y-6 shadow-xs">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs text-charcoal-light uppercase tracking-wide font-semibold">
                    Order Reference
                  </p>
                  <p className="font-bold text-charcoal font-mono">{orderNumber}</p>
                </div>
                <span className="px-3 py-1 bg-peach-xlight text-peach-dark text-xs font-bold rounded-full">
                  In Transit
                </span>
              </div>

              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                          step.done
                            ? "bg-peach-dark border-peach-dark text-white"
                            : step.active
                            ? "bg-white border-peach-dark text-peach-dark"
                            : "bg-white border-peach-light"
                        }`}
                      >
                        {step.done ? (
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        ) : (
                          <div className={`w-2.5 h-2.5 rounded-full ${step.active ? "bg-peach-dark animate-pulse" : "bg-peach-light"}`} />
                        )}
                      </div>
                      {idx < steps.length - 1 && (
                        <div className={`w-0.5 h-8 mt-1 ${step.done ? "bg-peach-dark" : "bg-peach-light"}`} />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className={`text-sm font-semibold ${step.done || step.active ? "text-charcoal" : "text-charcoal-light"}`}>
                        {step.label}
                      </p>
                      <p className="text-xs text-charcoal-light">{step.date}</p>
                    </div>
                  </div>
                ))}
              </div>
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
