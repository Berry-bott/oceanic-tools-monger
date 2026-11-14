"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStoreCart } from "@/stores/store-cart.store";
import { useCustomerAuth } from "@/stores/customer-auth.store";
import { createStoreOrder, fetchStoreInfo, type StoreBranch } from "@/services/store/store.service";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { useStoreCartStock } from "@/hooks/use-store-cart-stock";

const FREE_SHIPPING_THRESHOLD = 100000;
const STANDARD_DELIVERY_FEE = 4500;

export default function CheckoutPage() {
  const { refreshStock } = useStoreCartStock();
  const router = useRouter();
  const { customer } = useCustomerAuth();
  const {
    items,
    clearCart,
    removeItem,
    selectedBranchId,
    setSelectedBranchId,
    fulfillmentMethod,
    setFulfillmentMethod,
    customerName,
    email,
    phone,
    deliveryAddress,
    whatsappOptIn,
    setCustomerDetails,
  } = useStoreCart();

  // Auto-fill from customer account if logged in and fields are blank
  useEffect(() => {
    if (customer) {
      const updates: Record<string, string> = {};
      const fullName = `${customer.firstName || ""} ${customer.lastName || ""}`.trim() || customer.name || "";
      if (!customerName && fullName) updates.customerName = fullName;
      if (!email && customer.email) updates.email = customer.email;
      if (!phone && customer.phone) updates.phone = customer.phone;
      if (!deliveryAddress && customer.address) updates.deliveryAddress = customer.address;
      if (Object.keys(updates).length > 0) {
        setCustomerDetails(updates);
      }
    }
  }, [customer]);

  const [branches, setBranches] = useState<StoreBranch[]>([]);
  const [storeInfo, setStoreInfo] = useState<Awaited<ReturnType<typeof fetchStoreInfo>>>(null);
  const [isLoadingStoreInfo, setIsLoadingStoreInfo] = useState(true);
  const [paymentOption, setPaymentOption] = useState<"PAYSTACK" | "PAY_ON_PICKUP">("PAYSTACK");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchStoreInfo()
      .then((info) => {
        setStoreInfo(info);
        setBranches(info?.branches ?? []);
        if (info && !info.onlineDeliveryEnabled) setFulfillmentMethod("COLLECTION");
        if (!info) setErrorMessage("Checkout settings could not be loaded. Please refresh and try again.");
      })
      .catch((error: unknown) => {
        setErrorMessage(error instanceof Error ? error.message : "Pickup locations could not be loaded.");
      })
      .finally(() => {
        setIsLoadingStoreInfo(false);
      });
  }, [setFulfillmentMethod]);

  const subtotal = items.reduce((sum, item) => sum + item.sellingPrice * item.quantity, 0);
  const unavailableItems = items.filter((item) => typeof item.available === "number" && item.quantity > item.available);
  const isFreeDelivery = subtotal >= FREE_SHIPPING_THRESHOLD;
  const deliveryFee = fulfillmentMethod === "DELIVERY"
    ? (isFreeDelivery ? 0 : Number(storeInfo?.onlineDeliveryFee ?? STANDARD_DELIVERY_FEE))
    : 0;
  const formattedDeliveryFee = isFreeDelivery
    ? "FREE"
    : `₦${Number(storeInfo?.onlineDeliveryFee ?? STANDARD_DELIVERY_FEE).toLocaleString("en-NG")}`;
  const total = subtotal + deliveryFee;

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (items.length === 0) {
      setErrorMessage("Your cart is empty.");
      return;
    }

    if (!customerName.trim()) {
      setErrorMessage("Please enter your name or business name.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    if (fulfillmentMethod === "DELIVERY" && !deliveryAddress.trim()) {
      setErrorMessage("Please provide your delivery or jobsite address.");
      return;
    }

    if (
      fulfillmentMethod === "COLLECTION" &&
      (!selectedBranchId || !branches.some((branch) => branch.id === selectedBranchId))
    ) {
      setErrorMessage("Please choose one of the available pickup locations.");
      return;
    }

    try {
      setIsSubmitting(true);
      const result = await createStoreOrder({
        branchId: fulfillmentMethod === "COLLECTION" ? selectedBranchId ?? undefined : undefined,
        customerId: customer?.id,
        customerName: customerName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        fulfillmentMethod,
        paymentOption,
        deliveryAddress: fulfillmentMethod === "DELIVERY" ? deliveryAddress.trim() : undefined,
        lines: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });

      clearCart();

      if (result.paymentDueAtPickup) {
        router.push(`/checkout/confirmation?reference=${encodeURIComponent(result.payment.reference)}`);
        return;
      }

      if (result.payment?.authorizationUrl) {
        window.location.href = result.payment.authorizationUrl;
      } else {
        router.push(
          `/checkout/confirmation?reference=${encodeURIComponent(
            result.payment?.reference || result.orderNumber
          )}`
        );
      }
    } catch (error) {
      await refreshStock().catch(() => undefined);
      setErrorMessage(error instanceof Error ? error.message : "The order could not be placed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream text-charcoal flex flex-col font-sans selection:bg-peach-light selection:text-peach-deep">
      <StoreHeader />

      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-charcoal-light">
          <Link href="/" className="hover:text-peach-dark transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/store" className="hover:text-peach-dark transition-colors">
            Shop
          </Link>
          <span>/</span>
          <span className="text-charcoal font-medium">Checkout</span>
        </div>

        {/* Live stock status */}
        {items.length > 0 && (
          <div className="bg-white border border-peach-light rounded-2xl p-4 text-xs text-charcoal font-medium">
            <span>Availability refreshes automatically. Items are not reserved until your order is submitted.</span>
            {unavailableItems.length > 0 && <p className="mt-2 text-red-700">Some quantities are no longer available. Adjust or remove those items before placing your order.</p>}
          </div>
        )}

        {items.length === 0 ? (
          <div className="bg-white rounded-3xl border border-peach-light p-14 text-center text-charcoal-light space-y-4 max-w-md mx-auto shadow-xs">
            <div className="w-20 h-20 rounded-full bg-peach-light/60 text-peach-dark mx-auto flex items-center justify-center">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="font-display text-2xl text-charcoal">
              Your Cart is Empty
            </h2>
            <p className="text-sm">
              Explore our industrial power tools, saws, fasteners & safety equipment.
            </p>
            <Link
              href="/store"
              className="inline-block bg-peach-dark hover:bg-peach-deep text-white text-xs font-bold uppercase tracking-wider px-8 py-3.5 rounded-full transition-all shadow-md"
            >
              Browse Shop
            </Link>
          </div>
        ) : (
          <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left 7 Columns: Checkout Form Steps */}
            <div className="lg:col-span-7 space-y-6">
              {/* Step 1: Customer Info */}
              <div className="bg-white rounded-3xl border border-peach-light p-6 sm:p-7 space-y-4 shadow-xs">
                <div className="flex items-center gap-3 border-b border-peach-light pb-3">
                  <span className="w-7 h-7 rounded-full bg-peach-dark text-white flex items-center justify-center font-bold text-xs">
                    1
                  </span>
                  <h3 className="font-display text-xl text-charcoal">
                    Customer & Contact Details
                  </h3>
                </div>

                <div className="space-y-4 text-xs">
                  {/* Account Status / Login Prompt */}
                  {customer ? (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3 text-xs text-emerald-800">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <div>
                          <p className="font-semibold text-emerald-900">
                            Signed in as {customer.firstName || customer.name || customer.email}
                          </p>
                          <p className="text-[11px] text-emerald-700">
                            This purchase will be automatically saved to your order history and receipt vault.
                          </p>
                        </div>
                      </div>
                      <Link
                        href="/account"
                        target="_blank"
                        className="text-emerald-700 font-bold hover:underline shrink-0 text-[11px]"
                      >
                        Account
                      </Link>
                    </div>
                  ) : (
                    <div className="bg-peach-xlight/80 border border-peach-light rounded-2xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-peach-dark shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Have an Oceanic Tools account or want to sign in with Google?</span>
                      </div>
                      <Link
                        href="/account"
                        className="text-peach-dark font-bold hover:underline text-xs"
                      >
                        Sign in / Continue with Google →
                      </Link>
                    </div>
                  )}

                  <div>
                    <label className="text-charcoal font-medium block mb-1.5">
                      Full Name / Business Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerDetails({ customerName: e.target.value })}
                      placeholder="e.g. Samuel Adekunle / BuildWorks Nigeria"
                      className="w-full px-4 py-3 rounded-xl border border-peach-light focus:outline-none focus:border-peach-dark bg-cream/30 text-charcoal text-sm"
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-charcoal font-medium block mb-1.5">
                        Email Address (for receipt & updates) *
                      </label>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setCustomerDetails({ email: e.target.value })}
                        placeholder="samuel@example.com"
                        className="w-full px-4 py-3 rounded-xl border border-peach-light focus:outline-none focus:border-peach-dark bg-cream/30 text-charcoal text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-charcoal font-medium block mb-1.5">
                        Phone Number (WhatsApp notifications)
                      </label>
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setCustomerDetails({ phone: e.target.value })}
                        placeholder="+234 803 123 4567"
                        className="w-full px-4 py-3 rounded-xl border border-peach-light focus:outline-none focus:border-peach-dark bg-cream/30 text-charcoal text-sm"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer pt-1 text-charcoal-light">
                    <input
                      type="checkbox"
                      checked={whatsappOptIn}
                      onChange={(e) => setCustomerDetails({ whatsappOptIn: e.target.checked })}
                      className="accent-peach-dark rounded"
                    />
                    <span>Receive instant WhatsApp updates when order dispatches</span>
                  </label>
                </div>
              </div>

              {/* Step 2: Fulfillment & Delivery */}
              <div className="bg-white rounded-3xl border border-peach-light p-6 sm:p-7 space-y-4 shadow-xs">
                <div className="flex items-center gap-3 border-b border-peach-light pb-3">
                  <span className="w-7 h-7 rounded-full bg-peach-dark text-white flex items-center justify-center font-bold text-xs">
                    2
                  </span>
                  <h3 className="font-display text-xl text-charcoal">
                    Delivery or Pickup
                  </h3>
                </div>

                <div className="grid sm:grid-cols-2 gap-3 text-xs">
                  {storeInfo?.onlineDeliveryEnabled && <button
                    type="button"
                    onClick={() => {
                      setFulfillmentMethod("DELIVERY");
                      setPaymentOption("PAYSTACK");
                    }}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      fulfillmentMethod === "DELIVERY"
                        ? "border-peach-dark bg-peach-xlight/60 shadow-xs"
                        : "border-peach-light hover:border-peach bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-charcoal">Direct Delivery</span>
                      <span className="text-xs font-bold text-peach-dark">
                        {formattedDeliveryFee}
                      </span>
                    </div>
                    <p className="text-charcoal-light leading-relaxed">
                      Delivered straight to your site or warehouse address.
                    </p>
                  </button>}

                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod("COLLECTION")}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      fulfillmentMethod === "COLLECTION"
                        ? "border-peach-dark bg-peach-xlight/60 shadow-xs"
                        : "border-peach-light hover:border-peach bg-white"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm text-charcoal">Warehouse Pickup</span>
                      <span className="text-xs font-bold text-emerald-600">FREE</span>
                    </div>
                    <p className="text-charcoal-light leading-relaxed">
                      Collect from one of our available pickup branches.
                    </p>
                  </button>
                </div>

                {fulfillmentMethod === "DELIVERY" ? (
                  <div className="space-y-2 pt-2 text-xs">
                    <label className="text-charcoal font-medium block">
                      Delivery Address / Jobsite Location *
                    </label>
                    <textarea
                      required
                      rows={3}
                      value={deliveryAddress}
                      onChange={(e) => setCustomerDetails({ deliveryAddress: e.target.value })}
                      placeholder="Enter your complete delivery or jobsite address"
                      className="w-full px-4 py-3 rounded-xl border border-peach-light focus:outline-none focus:border-peach-dark bg-cream/30 text-charcoal text-sm resize-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-2 pt-2 text-xs">
                    <label className="text-charcoal font-medium block">
                      Select Pickup Warehouse Hub
                    </label>
                    <div className="space-y-2">
                      {isLoadingStoreInfo ? (
                        <div className="space-y-2" role="status" aria-label="Loading pickup locations" aria-busy="true">
                          {[0, 1].map((item) => (
                            <div key={item} className="animate-pulse rounded-xl border border-peach-light p-4">
                              <div className="h-4 w-2/5 rounded bg-peach-light/70" />
                              <div className="mt-2 h-3 w-4/5 rounded bg-peach-light/70" />
                            </div>
                          ))}
                        </div>
                      ) : branches.map((b) => (
                        <label
                          key={b.id}
                          className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                            selectedBranchId === b.id
                              ? "border-peach-dark bg-peach-xlight/50"
                              : "border-peach-light hover:bg-cream/40"
                          }`}
                        >
                          <div>
                            <p className="font-bold text-charcoal">{b.name}</p>
                            <p className="text-charcoal-light text-[11px]">
                              {b.address}
                            </p>
                          </div>
                          <input
                            type="radio"
                            name="branch"
                            checked={selectedBranchId === b.id}
                            onChange={() => setSelectedBranchId(b.id)}
                            className="accent-peach-dark"
                          />
                        </label>
                      ))}
                      {!isLoadingStoreInfo && branches.length === 0 && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          No pickup locations are currently available. Please choose delivery or contact the store.
                        </p>
                      )}
                      {!storeInfo?.onlineDeliveryEnabled && !branches.length && !isLoadingStoreInfo && (
                        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                          Checkout is not available until the store enables delivery or pickup.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Step 3: Payment Method */}
              <div className="bg-white rounded-3xl border border-peach-light p-6 sm:p-7 space-y-4 shadow-xs">
                <div className="flex items-center gap-3 border-b border-peach-light pb-3">
                  <span className="w-7 h-7 rounded-full bg-peach-dark text-white flex items-center justify-center font-bold text-xs">
                    3
                  </span>
                  <h3 className="font-display text-xl text-charcoal">
                    Payment Option
                  </h3>
                </div>

                <div className="space-y-3 text-xs">
                  <label
                    className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                      paymentOption === "PAYSTACK"
                        ? "border-peach-dark bg-peach-xlight/60 shadow-xs"
                        : "border-peach-light hover:border-peach bg-white"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        checked={paymentOption === "PAYSTACK"}
                        onChange={() => setPaymentOption("PAYSTACK")}
                        className="accent-peach-dark"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm text-charcoal">
                            Pay Online (Cards or Bank Transfer)
                          </p>
                          <span className="bg-peach-light text-peach-deep text-[10px] font-bold px-2 py-0.5 rounded-full">
                            INSTANT
                          </span>
                        </div>
                        <p className="text-charcoal-light text-[11px] mt-0.5">
                          Pay securely online before your order is processed.
                        </p>
                      </div>
                    </div>
                  </label>

                  {fulfillmentMethod === "COLLECTION" && storeInfo?.payOnPickupEnabled && (
                    <label
                      className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                        paymentOption === "PAY_ON_PICKUP"
                          ? "border-peach-dark bg-peach-xlight/60 shadow-xs"
                          : "border-peach-light hover:border-peach bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="payment"
                          checked={paymentOption === "PAY_ON_PICKUP"}
                          onChange={() => setPaymentOption("PAY_ON_PICKUP")}
                          className="accent-peach-dark"
                        />
                        <div>
                          <p className="font-bold text-sm text-charcoal">Pay on Pickup</p>
                          <p className="text-charcoal-light text-[11px] mt-0.5">
                            Pay at the selected warehouse when collecting. This is not available for delivery orders.
                          </p>
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {/* Right 5 Columns: Order Summary Card */}
            <div className="lg:col-span-5 bg-white rounded-3xl border border-peach-light p-6 sm:p-7 space-y-6 shadow-sm sticky top-24">
              <div className="border-b border-peach-light pb-4">
                <h3 className="font-display text-2xl text-charcoal">
                  Order Summary
                </h3>
                <p className="text-xs text-charcoal-light mt-0.5">
                  {items.length} {items.length === 1 ? "product" : "products"} in cart
                </p>
              </div>

              {/* Items List */}
              <div className="divide-y divide-peach-light/60 max-h-72 overflow-y-auto pr-1">
                {items.map((item) => (
                  <div key={item.productId} className="py-3 flex gap-3 items-center text-xs">
                    <div className="w-14 h-14 rounded-2xl bg-peach-xlight flex-shrink-0 overflow-hidden border border-peach-light p-1 flex items-center justify-center">
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
                        <div className="w-full h-full flex items-center justify-center font-bold text-peach-dark text-xs">
                          TOOL
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-charcoal truncate">{item.name}</p>
                      <p className="text-charcoal-light text-[11px] font-mono">
                        Qty: {item.quantity} × ₦{item.sellingPrice.toLocaleString("en-NG")}
                      </p>
                      {typeof item.available === "number" && (
                        <p className={`mt-1 text-[11px] font-semibold ${item.available <= 0 ? "text-red-600" : item.quantity > item.available ? "text-amber-700" : "text-emerald-700"}`}>
                          {item.available <= 0 ? "Out of stock across all branches" : item.quantity > item.available ? `Only ${item.available} available across the store` : `${item.available} available across the store`}
                        </p>
                      )}
                    </div>
                    {typeof item.available === "number" && item.quantity > item.available && (
                      <button type="button" onClick={() => removeItem(item.productId)} className="text-[11px] font-semibold text-red-700 underline">Remove</button>
                    )}
                    <span className="font-display font-bold text-charcoal text-sm">
                      ₦{(item.sellingPrice * item.quantity).toLocaleString("en-NG")}
                    </span>
                  </div>
                ))}
              </div>

              {/* Cost Breakdown */}
              <div className="space-y-2 border-t border-peach-light pt-4 text-xs">
                <div className="flex justify-between text-charcoal-light">
                  <span>Subtotal</span>
                  <span className="font-medium text-charcoal">
                    ₦{subtotal.toLocaleString("en-NG")}
                  </span>
                </div>

                <div className="flex justify-between text-charcoal-light">
                  <span>Delivery & Freight</span>
                  <span className="font-medium text-charcoal">
                    {deliveryFee === 0 ? (
                      <span className="text-peach-deep font-bold uppercase">FREE</span>
                    ) : (
                      `₦${deliveryFee.toLocaleString("en-NG")}`
                    )}
                  </span>
                </div>

                {fulfillmentMethod === "DELIVERY" && isFreeDelivery && (
                  <p className="text-[11px] text-peach-deep font-medium bg-peach-xlight p-2.5 rounded-xl border border-peach-light">
                    🎉 Free Express Delivery applied to your order!
                  </p>
                )}

                <div className="flex justify-between items-baseline border-t border-peach-light pt-3 text-base">
                  <span className="font-medium text-charcoal">Total Payable</span>
                  <span className="font-display font-bold text-2xl text-peach-deep">
                    ₦{total.toLocaleString("en-NG")}
                  </span>
                </div>
              </div>

              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 font-bold">
                  ⚠️ {errorMessage}
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting || isLoadingStoreInfo || !storeInfo || unavailableItems.length > 0 || (fulfillmentMethod === "DELIVERY" && !storeInfo.onlineDeliveryEnabled)}
                className="w-full py-4 bg-peach-dark hover:bg-peach-deep text-white font-medium text-xs uppercase tracking-wider rounded-full transition-all shadow-md hover:scale-[1.01] flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <span>Processing Order…</span>
                ) : (
                  <>
                    <span>{paymentOption === "PAY_ON_PICKUP" ? "Place Order — Pay on Pickup" : "Confirm Order & Pay"}</span>
                    <span>— ₦{total.toLocaleString("en-NG")}</span>
                  </>
                )}
              </button>

              <div className="pt-2 text-center space-y-1">
                <p className="text-[11px] text-charcoal-light">
                  {paymentOption === "PAY_ON_PICKUP"
                    ? "Payment will be collected at your selected pickup branch."
                    : "🔒 Bank-Grade 256-Bit SSL Encryption via Paystack"}
                </p>
                <p className="text-[10px] text-charcoal-light/70">
                  By clicking Confirm Order, you agree to Oceanic Tools Monger Terms of Sale & Warranty.
                </p>
              </div>
            </div>
          </form>
        )}
      </main>

      <StoreFooter />
    </div>
  );
}
