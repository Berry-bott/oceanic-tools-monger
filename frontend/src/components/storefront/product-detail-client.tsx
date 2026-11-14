"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Product3DViewer } from "./product-3d-viewer";
import { StoreProductCard } from "./store-product-card";
import { useStoreCart } from "@/stores/store-cart.store";
import type { StoreProduct } from "@/data/tools-catalog";
import { fetchStoreStock, getCustomerAccount, loginStoreCustomer, registerStoreCustomer, submitProductReview, type CustomerAccount } from "@/services/store/store.service";

interface ProductDetailClientProps {
  product: StoreProduct;
  relatedProducts?: StoreProduct[];
  storeSlug?: string;
}

const TABS = ["Description", "Specifications", "Reviews"] as const;
type TabType = (typeof TABS)[number];

function StarRating({ rating, size = "sm" }: { rating: number; size?: "sm" | "lg" }) {
  const iconSize = size === "lg" ? "w-5 h-5" : "w-3.5 h-3.5";
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((t) => (
        <svg
          key={t}
          className={`${iconSize} ${t <= Math.round(rating) ? "text-peach-dark" : "text-peach-light"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 0 0 .95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 0 0-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 0 0-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 0 0-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 0 0 .951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export function ProductDetailClient({
  product,
  relatedProducts = [],
  storeSlug,
}: ProductDetailClientProps) {
  const router = useRouter();
  const { addItem, setDrawerOpen } = useStoreCart();
  const [stockAvailable, setStockAvailable] = useState(product.stockCount ?? 0);
  const inStock = stockAvailable > 0;
  const [viewMode, setViewMode] = useState<"3d" | "photo">("3d");
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [activeTab, setActiveTab] = useState<TabType>("Description");
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [customer, setCustomer] = useState<CustomerAccount | null | undefined>(undefined);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [reviewRating, setReviewRating] = useState("5");
  const [reviewComment, setReviewComment] = useState("");
  const [reviewError, setReviewError] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const refreshStock = async () => {
      try {
        const stock = await fetchStoreStock(storeSlug);
        const currentProduct = stock.find((item) => item.productId === product.id);
        if (active) setStockAvailable(currentProduct?.available ?? 0);
      } catch {
        // Preserve the last known stock count if the refresh fails.
      }
    };
    void refreshStock();
    const interval = window.setInterval(() => void refreshStock(), 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshStock();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [product.id, storeSlug]);

  useEffect(() => {
    if (activeTab !== "Reviews" || customer !== undefined) return;
    getCustomerAccount().then(setCustomer).catch((error: unknown) => {
      setReviewError(error instanceof Error ? error.message : "Could not check customer sign-in status.");
      setCustomer(null);
    });
  }, [activeTab, customer]);

  const discountPercent =
    product.originalPrice && product.originalPrice > product.price
      ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
      : null;
  const specifications = product.specifications ?? {};

  const handleAddToCart = () => {
    addItem(
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sellingPrice: product.price,
        unit: product.unit ?? "",
        imageUrl: product.images[0],
        category: product.category,
        brand: product.brand,
        available: stockAvailable,
      },
      quantity
    );
    setDrawerOpen(true);
  };

  const handleBuyNow = () => {
    addItem(
      {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        sellingPrice: product.price,
        unit: product.unit ?? "",
        imageUrl: product.images[0],
        category: product.category,
        brand: product.brand,
        available: stockAvailable,
      },
      quantity
    );
    router.push("/checkout");
  };

  async function submitCustomerAccess(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!storeSlug) {
      setReviewError("This store is not available for customer sign-in right now.");
      return;
    }
    setReviewError("");
    setReviewMessage("");
    setReviewBusy(true);
    try {
      if (authMode === "register") {
        await registerStoreCustomer({ name: authName, email: authEmail, phone: authPhone || undefined, password: authPassword }, storeSlug);
        setReviewMessage("Account created. Verify your email using the link we sent before signing in to review.");
        setAuthMode("login");
      } else {
        const result = await loginStoreCustomer({ email: authEmail, password: authPassword }, storeSlug) as { customer: { id: string }; email: string };
        setCustomer({ customerId: result.customer.id, email: result.email });
        setAuthPassword("");
        setReviewMessage("Signed in. You can now submit a verified-purchase review.");
      }
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Customer sign-in failed.");
    } finally {
      setReviewBusy(false);
    }
  }

  async function submitReview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReviewError("");
    setReviewMessage("");
    setReviewBusy(true);
    try {
      await submitProductReview(product.id, { rating: Number(reviewRating), comment: reviewComment });
      setReviewMessage("Thank you. Your verified-purchase review has been saved.");
      router.refresh();
    } catch (error) {
      setReviewError(error instanceof Error ? error.message : "Could not save your review.");
    } finally {
      setReviewBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-charcoal font-sans">
      {/* Breadcrumbs */}
      <div className="bg-cream border-b border-peach-light">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-2 text-xs text-charcoal-light">
          <Link href="/" className="hover:text-peach-dark transition-colors">
            Home
          </Link>
          <span>/</span>
          <Link href="/store" className="hover:text-peach-dark transition-colors">
            Shop
          </Link>
          <span>/</span>
          <Link
            href={`/store?category=${product.category}`}
            className="hover:text-peach-dark transition-colors"
          >
            {product.category}
          </Link>
          <span>/</span>
          <span className="text-charcoal line-clamp-1">{product.name}</span>
        </div>
      </div>

      {/* Main Showcase */}
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* Left Column: 3D Viewer or Photos */}
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === "3d"
                    ? "bg-peach-dark text-white"
                    : "bg-peach-light text-charcoal hover:bg-peach"
                }`}
              >
                <span>3D View</span>
                <span className="bg-white/30 text-[9px] px-1.5 py-0.5 rounded-full font-black">
                  NEW
                </span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("photo")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  viewMode === "photo"
                    ? "bg-peach-dark text-white"
                    : "bg-peach-light text-charcoal hover:bg-peach"
                }`}
              >
                Photos ({product.images.length})
              </button>
            </div>

            {viewMode === "3d" ? (
              <Product3DViewer images={product.images} productName={product.name} />
            ) : (
              <div className="space-y-3">
                <div className="aspect-square rounded-2xl overflow-hidden bg-peach-xlight flex items-center justify-center p-6 border border-peach-light">
                  {product.images.length ? (
                    <img
                      src={product.images[activePhotoIdx] || product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-contain"
                    />
                  ) : <p className="text-sm text-charcoal-light">No product photo available.</p>}
                </div>
                {product.images.length > 1 && (
                  <div className="flex gap-2">
                    {product.images.map((img, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={`w-16 h-16 rounded-xl overflow-hidden border-2 transition-all p-1 bg-white ${
                          activePhotoIdx === idx
                            ? "border-peach-dark"
                            : "border-transparent opacity-60 hover:opacity-100"
                        }`}
                      >
                        <img
                          src={img}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right Column: Info & Purchase Form */}
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              {product.brand && <span className="text-xs font-bold tracking-[0.2em] text-peach-dark uppercase">{product.brand}</span>}
              <div className="flex gap-1.5">
                {product.badge && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-peach text-charcoal">
                    {product.badge}
                  </span>
                )}
                {discountPercent && (
                  <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-red-500 text-white">
                    -{discountPercent}%
                  </span>
                )}
              </div>
            </div>

            <h1 className="font-display text-3xl md:text-4xl font-bold text-charcoal leading-tight">
              {product.name}
            </h1>

            {product.reviewCount > 0 && product.rating > 0 && (
              <div className="flex items-center gap-3">
                <StarRating rating={product.rating} size="lg" />
                <span className="text-sm font-bold text-charcoal">{product.rating.toFixed(1)}</span>
                <span className="text-sm text-charcoal-light">
                  ({product.reviewCount.toLocaleString()} contractor reviews)
                </span>
              </div>
            )}

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-charcoal">
                ₦{product.price.toLocaleString("en-NG")}
              </span>
              {product.originalPrice && (
                <span className="text-lg text-charcoal-light line-through">
                  ₦{product.originalPrice.toLocaleString("en-NG")}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`w-2 h-2 rounded-full ${
                  inStock ? "bg-green-500 animate-pulse" : "bg-red-400"
                }`}
              />
              <span
                className={`text-sm font-medium ${
                  inStock ? "text-green-700" : "text-red-500"
                }`}
              >
                {inStock
                  ? stockAvailable < 15
                    ? `Only ${stockAvailable} left in stock across the store`
                    : "In stock across the store — ready for site dispatch"
                  : "Out of stock across all branches"}
              </span>
            </div>

            <p className="text-sm text-charcoal-light leading-relaxed">
              {product.description}
            </p>

            {/* Spec Attributes Summary Grid */}
            <div className="grid grid-cols-2 gap-3 py-4 border-y border-peach-light">
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Size / Package
                </p>
                <p className="text-sm font-medium text-charcoal">
                  {specifications["Size / Package"] || product.unit}
                </p>
              </div>
              {specifications["Duty Rating"] && (
                <div>
                  <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">Duty Rating</p>
                  <p className="text-sm font-medium text-charcoal">{specifications["Duty Rating"]}</p>
                </div>
              )}
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Category
                </p>
                <p className="text-sm font-medium text-charcoal">{product.category}</p>
              </div>
              <div>
                <p className="text-[11px] text-charcoal-light uppercase tracking-wide font-semibold">
                  Brand / SKU
                </p>
                <p className="text-sm font-medium text-charcoal font-mono">
                  {product.brand ? `${product.brand} / ` : ""}{product.sku}
                </p>
              </div>
            </div>

            {/* Stepper + Buttons */}
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center border border-peach rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    className="w-10 h-11 flex items-center justify-center text-charcoal hover:bg-peach-xlight transition-colors text-lg font-bold"
                  >
                    −
                  </button>
                  <span className="w-12 text-center font-semibold text-base">
                    {quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.min(stockAvailable, q + 1))}
                    disabled={quantity >= stockAvailable}
                    className="w-10 h-11 flex items-center justify-center text-charcoal hover:bg-peach-xlight transition-colors text-lg font-bold"
                  >
                    +
                  </button>
                </div>
                <span className="text-sm text-charcoal-light">
                  Max {stockAvailable} across the store
                </span>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!inStock || quantity > stockAvailable}
                  className="flex-1 py-3.5 bg-charcoal text-white rounded-xl font-semibold text-sm hover:bg-peach-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                >
                  Add to Cart
                </button>
                <button
                  type="button"
                  onClick={handleBuyNow}
                  disabled={!inStock || quantity > stockAvailable}
                  className="flex-1 py-3.5 bg-peach-dark text-white rounded-xl font-semibold text-sm text-center hover:bg-peach-deep transition-colors shadow-sm disabled:opacity-50"
                >
                  Buy Now
                </button>
                <button
                  type="button"
                  onClick={() => setIsWishlisted((w) => !w)}
                  className={`w-12 h-12 rounded-xl border flex items-center justify-center transition-all ${
                    isWishlisted
                      ? "bg-red-500 border-red-500 text-white"
                      : "border-peach text-charcoal-light hover:border-red-300 hover:text-red-500"
                  }`}
                  aria-label="Wishlist"
                >
                  <svg
                    className="w-5 h-5"
                    fill={isWishlisted ? "currentColor" : "none"}
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* 4 Trust Ticks */}
            <div className="flex flex-wrap gap-3 text-xs text-charcoal-light pt-2">
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Authentic product
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Secure checkout
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Fast delivery
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-green-500 font-bold">✓</span> Easy returns
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Tabs */}
        <div className="mt-16">
          <div className="flex gap-1 border-b border-peach-light overflow-x-auto hide-scrollbar">
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-3 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  activeTab === tab
                    ? "border-peach-dark text-peach-dark"
                    : "border-transparent text-charcoal-light hover:text-charcoal"
                }`}
              >
                {tab}
                {tab === "Reviews" && product.reviewCount > 0 && ` (${product.reviewCount})`}
              </button>
            ))}
          </div>

          <div className="pt-8 max-w-2xl">
            {activeTab === "Description" && (
              <p className="text-sm text-charcoal-light leading-relaxed">
                {product.description}
              </p>
            )}

            {activeTab === "Specifications" && (
              <div className="border border-peach-light rounded-2xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <tbody className="divide-y divide-peach-light/60">
                    {Object.keys(specifications).length ? (
                      Object.entries(specifications).map(([key, val]) => (
                        <tr key={key} className="hover:bg-peach-xlight/30">
                          <td className="px-5 py-3 font-semibold text-charcoal w-1/3 bg-peach-xlight/40">
                            {key}
                          </td>
                          <td className="px-5 py-3 text-charcoal font-mono">{val}</td>
                        </tr>
                      ))
                    ) : <tr><td className="px-5 py-3 text-charcoal-light">No specifications have been added.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === "Reviews" && (
              <div className="space-y-7">
                <div className="flex items-center gap-5 rounded-2xl bg-peach-xlight p-5">
                  <div>
                    <p className="m-0 text-4xl font-bold text-charcoal">{product.reviewCount > 0 ? product.rating.toFixed(1) : "—"}</p>
                    {product.reviewCount > 0 && <StarRating rating={product.rating} size="lg" />}
                    <p className="mb-0 mt-1 text-xs text-charcoal-light">{product.reviewCount} verified reviews</p>
                  </div>
                </div>

                {customer === undefined && <p className="text-sm text-charcoal-light">Checking customer sign-in…</p>}
                {customer && (
                  <form onSubmit={submitReview} className="grid gap-3 rounded-xl border border-peach-light p-4">
                    <p className="m-0 text-sm text-charcoal-light">Signed in as {customer.email}. Reviews are accepted only after a paid purchase through the store or a linked in-store customer account.</p>
                    <label className="grid gap-1 text-sm font-medium text-charcoal">Your rating
                      <select value={reviewRating} onChange={(event) => setReviewRating(event.target.value)} className="h-10 rounded-lg border border-peach-light bg-white px-3">
                        {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} {rating === 1 ? "star" : "stars"}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm font-medium text-charcoal">Your review <span className="font-normal text-charcoal-light">(optional)</span>
                      <textarea value={reviewComment} onChange={(event) => setReviewComment(event.target.value)} maxLength={2000} rows={4} className="rounded-lg border border-peach-light p-3 font-normal" placeholder="Share your experience with this product." />
                    </label>
                    <button type="submit" disabled={reviewBusy} className="w-fit rounded-lg bg-charcoal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{reviewBusy ? "Saving…" : "Submit review"}</button>
                  </form>
                )}
                {customer === null && (
                  <form onSubmit={submitCustomerAccess} className="grid gap-3 rounded-xl border border-peach-light p-4">
                    <p className="m-0 text-sm text-charcoal-light">Sign in or create a verified customer account to leave a review. Reviews require a completed paid purchase.</p>
                    {authMode === "register" && <>
                      <label className="grid gap-1 text-sm font-medium text-charcoal">Name<input required value={authName} onChange={(event) => setAuthName(event.target.value)} className="h-10 rounded-lg border border-peach-light px-3 font-normal" /></label>
                      <label className="grid gap-1 text-sm font-medium text-charcoal">Phone <span className="font-normal text-charcoal-light">(optional)</span><input value={authPhone} onChange={(event) => setAuthPhone(event.target.value)} className="h-10 rounded-lg border border-peach-light px-3 font-normal" /></label>
                    </>}
                    <label className="grid gap-1 text-sm font-medium text-charcoal">Email<input required type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} className="h-10 rounded-lg border border-peach-light px-3 font-normal" /></label>
                    <label className="grid gap-1 text-sm font-medium text-charcoal">Password<input required type="password" minLength={12} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} className="h-10 rounded-lg border border-peach-light px-3 font-normal" /></label>
                    <div className="flex flex-wrap items-center gap-3">
                      <button type="submit" disabled={reviewBusy || !storeSlug} className="rounded-lg bg-charcoal px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{reviewBusy ? "Please wait…" : authMode === "register" ? "Create account" : "Sign in"}</button>
                      <button type="button" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setReviewError(""); setReviewMessage(""); }} className="text-sm font-medium text-peach-dark underline">{authMode === "login" ? "Create an account" : "I already have an account"}</button>
                    </div>
                  </form>
                )}
                {reviewMessage && <p role="status" className="m-0 text-sm text-green-700">{reviewMessage}</p>}
                {reviewError && <p role="alert" className="m-0 text-sm text-red-700">{reviewError}</p>}

                <div className="space-y-4">
                  {(product.reviews ?? []).map((review, index) => (
                    <article key={`${review.createdAt}-${index}`} className="border-b border-peach-light pb-4">
                      <div className="flex items-center gap-2"><StarRating rating={review.rating} /><span className="text-sm font-semibold text-charcoal">{review.author}</span><time className="text-xs text-charcoal-light">{new Date(review.createdAt).toLocaleDateString()}</time></div>
                      {review.comment && <p className="mb-0 mt-2 text-sm leading-relaxed text-charcoal-light">{review.comment}</p>}
                    </article>
                  ))}
                  {!product.reviews?.length && <p className="m-0 text-sm text-charcoal-light">No customer reviews yet.</p>}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* You May Also Like */}
        {relatedProducts.length > 0 && (
          <div className="mt-16">
            <h2 className="font-display text-2xl font-bold text-charcoal mb-6">
              You May Also Like
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
              {relatedProducts.map((p) => (
                <StoreProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
