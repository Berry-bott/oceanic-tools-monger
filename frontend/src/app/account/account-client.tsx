"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useCustomerAuth } from "@/stores/customer-auth.store";
import { useStoreCart } from "@/stores/store-cart.store";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { StoreHeader } from "@/components/storefront/store-header";
import { StoreFooter } from "@/components/storefront/store-footer";
import { MobileBottomNav } from "@/components/storefront/mobile-bottom-nav";
import {
  customerAccountService,
  type CustomerOrder,
  type CustomerStatement,
} from "@/services/customer/customer-account.service";

function printFocusedLayout(selector: string) {
  const layout = document.querySelector<HTMLElement>(selector);
  if (!layout) return;

  const cleanup = () => {
    layout.classList.remove("print-selected");
    document.body.classList.remove("printing-focused");
  };

  layout.classList.add("print-selected");
  document.body.classList.add("printing-focused");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
  window.setTimeout(cleanup, 1000);
}

export function AccountClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectUrl = searchParams.get("redirect") || "/account";

  const {
    customer,
    email,
    isAuthenticated,
    isLoading: authLoading,
    error: authError,
    checkSession,
    login,
    register,
    loginWithGoogle,
    logout,
    updateProfile,
    updateAvatar,
    clearError,
  } = useCustomerAuth();

  const { addItem, setDrawerOpen } = useStoreCart();

  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [activeTab, setActiveTab] = useState<"orders" | "profile" | "statement">("orders");
  const [showPassword, setShowPassword] = useState(false);
  const [copiedOrderId, setCopiedOrderId] = useState<string | null>(null);
  const [reorderedLineId, setReorderedLineId] = useState<string | null>(null);

  // Search & Filter state for Orders (Filter by Date, Status, Search, and Sort)
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("ALL");
  const [dateFilter, setDateFilter] = useState<string>("ALL");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  const [sortOrder, setSortOrder] = useState<"NEWEST" | "OLDEST">("NEWEST");

  // Auth form state
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPhone, setAuthPhone] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Profile edit state
  const [profileName, setProfileName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAddress, setProfileAddress] = useState("");
  const [profileUpdating, setProfileUpdating] = useState(false);

  // Orders and Statement state
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [statement, setStatement] = useState<CustomerStatement | null>(null);
  const [statementLoading, setStatementLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Sync tab with URL parameter (?tab=orders | ?tab=profile | ?tab=statement)
  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "orders" || tabParam === "profile" || tabParam === "statement") {
      setActiveTab(tabParam);
    } else {
      setActiveTab("orders");
    }
  }, [searchParams]);

  useEffect(() => {
    if (isAuthenticated) {
      checkSession();
    }
  }, [isAuthenticated, checkSession]);

  useEffect(() => {
    if (customer) {
      setProfileName(customer.name || "");
      setProfilePhone(customer.phone || "");
      setProfileAddress(customer.address || "");
    }
  }, [customer]);

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === "orders") {
        setOrdersLoading(true);
        customerAccountService
          .getOrders()
          .then((data) => setOrders(data))
          .catch((err) => console.warn("Failed loading orders:", err))
          .finally(() => setOrdersLoading(false));
      } else if (activeTab === "statement") {
        setStatementLoading(true);
        customerAccountService
          .getStatement()
          .then((data) => setStatement(data))
          .catch((err) => console.warn("Failed loading statement:", err))
          .finally(() => setStatementLoading(false));
      }
    }
  }, [isAuthenticated, activeTab]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await login({ email: authEmail, password: authPassword });
      if (redirectUrl && redirectUrl !== "/account") {
        router.push(redirectUrl);
      }
    } catch {
      // Error handled by store
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    try {
      await register({
        name: authName,
        email: authEmail,
        phone: authPhone.trim() || undefined,
        password: authPassword,
      });
      await login({ email: authEmail, password: authPassword });
      if (redirectUrl && redirectUrl !== "/account") {
        router.push(redirectUrl);
      }
    } catch {
      // Error handled by store
    }
  };

  const handleGoogleSuccess = async (credential: string) => {
    clearError();
    try {
      await loginWithGoogle(credential);
      if (redirectUrl && redirectUrl !== "/account") {
        router.push(redirectUrl);
      }
    } catch {
      // Error handled by store
    }
  };

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileUpdating(true);
    setActionSuccess(null);
    try {
      await updateProfile({
        name: profileName,
        phone: profilePhone,
        address: profileAddress,
      });
      setActionSuccess("Profile details updated successfully.");
      setTimeout(() => setActionSuccess(null), 3500);
    } catch {
      // Error handled by store
    } finally {
      setProfileUpdating(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("Image must be smaller than 5MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const size = 280;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const minDim = Math.min(img.width, img.height);
          const sx = (img.width - minDim) / 2;
          const sy = (img.height - minDim) / 2;
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.88);
          setActionSuccess("Saving photo to server...");
          updateAvatar(compressedDataUrl)
            .then(() => {
              setActionSuccess("Profile photo saved successfully!");
              setTimeout(() => setActionSuccess(null), 3500);
            })
            .catch(() => {
              setActionSuccess("Photo updated locally.");
              setTimeout(() => setActionSuccess(null), 3500);
            });
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleCopyOrderNumber = (num: string) => {
    navigator.clipboard?.writeText(num);
    setCopiedOrderId(num);
    setTimeout(() => setCopiedOrderId(null), 2000);
  };

  const handleReorder = (line: any) => {
    addItem(
      {
        productId: line.product?.id || line.id,
        name: line.productName,
        sku: line.sku,
        sellingPrice: typeof line.unitPrice === "string" ? parseFloat(line.unitPrice) : line.unitPrice,
        unit: "unit",
        imageUrl: line.product?.imageUrl || null,
        category: line.product?.category || "Industrial Tools",
      },
      typeof line.quantity === "string" ? parseInt(line.quantity, 10) : line.quantity
    );
    setReorderedLineId(line.id);
    setDrawerOpen(true);
    setTimeout(() => setReorderedLineId(null), 2500);
  };

  const formatCurrency = (amount: number | string) => {
    const val = typeof amount === "string" ? parseFloat(amount) : amount;
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: "NGN",
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status?.toUpperCase()) {
      case "COMPLETED":
      case "DELIVERED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Delivered
          </span>
        );
      case "DISPATCHED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-sky-50 text-sky-700 border border-sky-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping" />
            Dispatched to Site
          </span>
        );
      case "PROCESSING":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
            Processing
          </span>
        );
      case "CANCELLED":
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            Order Confirmed
          </span>
        );
    }
  };

  // Filter orders by search query, status, date range, and sort
  const filteredOrders = useMemo(() => {
    let list = [...orders];

    // 1. Status Filter
    if (orderStatusFilter !== "ALL") {
      list = list.filter((order) => {
        const s = order.status?.toUpperCase();
        if (orderStatusFilter === "DELIVERED") return s === "COMPLETED" || s === "DELIVERED";
        if (orderStatusFilter === "DISPATCHED") return s === "DISPATCHED";
        if (orderStatusFilter === "PROCESSING") return s === "PROCESSING" || s === "PENDING";
        if (orderStatusFilter === "CANCELLED") return s === "CANCELLED";
        return true;
      });
    }

    // 2. Date Filter
    if (dateFilter !== "ALL") {
      const now = new Date();
      list = list.filter((order) => {
        const orderDate = new Date(order.createdAt);
        if (isNaN(orderDate.getTime())) return true;

        if (dateFilter === "TODAY") {
          const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          return orderDate >= startOfToday;
        }
        if (dateFilter === "THIS_WEEK") {
          const past = new Date();
          past.setDate(now.getDate() - 7);
          return orderDate >= past;
        }
        if (dateFilter === "30_DAYS") {
          const past = new Date();
          past.setDate(now.getDate() - 30);
          return orderDate >= past;
        }
        if (dateFilter === "3_MONTHS") {
          const past = new Date();
          past.setMonth(now.getMonth() - 3);
          return orderDate >= past;
        }
        if (dateFilter === "THIS_YEAR") {
          const startOfYear = new Date(now.getFullYear(), 0, 1);
          return orderDate >= startOfYear;
        }
        if (dateFilter === "CUSTOM") {
          if (startDate) {
            const sDate = new Date(startDate);
            sDate.setHours(0, 0, 0, 0);
            if (orderDate < sDate) return false;
          }
          if (endDate) {
            const eDate = new Date(endDate);
            eDate.setHours(23, 59, 59, 999);
            if (orderDate > eDate) return false;
          }
          return true;
        }
        return true;
      });
    }

    // 3. Keyword Search
    if (orderSearchQuery.trim()) {
      const q = orderSearchQuery.toLowerCase();
      list = list.filter((order) => {
        const matchesNumber = order.number?.toLowerCase().includes(q);
        const matchesItem = order.lines?.some(
          (l) => l.productName?.toLowerCase().includes(q) || l.sku?.toLowerCase().includes(q)
        );
        return matchesNumber || matchesItem;
      });
    }

    // 4. Sort by Date
    list.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime() || 0;
      const dateB = new Date(b.createdAt).getTime() || 0;
      return sortOrder === "NEWEST" ? dateB - dateA : dateA - dateB;
    });

    return list;
  }, [orders, orderStatusFilter, dateFilter, startDate, endDate, orderSearchQuery, sortOrder]);

  // -------------------------------------------------------------------------
  // VIEW 1: AUTHENTICATED CUSTOMER DASHBOARD
  // (PAGES ACCESSED VIA PROFILE DROPDOWN: PURCHASES, PROFILE, STATEMENT)
  // -------------------------------------------------------------------------
  if (isAuthenticated && customer) {
    const totalSpent = orders.reduce((acc, o) => {
      const val = typeof o.total === "string" ? parseFloat(o.total) : o.total;
      return acc + (val || 0);
    }, 0);

    const statementTotalInvoiced = statement?.entries?.reduce((acc, e) => {
      const val = typeof e.total === "string" ? parseFloat(e.total) : e.total;
      return acc + (val || 0);
    }, 0) || totalSpent;

    const statementTotalPaid = statement?.entries?.reduce((acc, e) => {
      const val = typeof e.paid === "string" ? parseFloat(e.paid as any) : e.paid;
      return acc + (val || 0);
    }, 0) || totalSpent;

    const initial = customer.name?.charAt(0).toUpperCase() || customer.firstName?.charAt(0).toUpperCase() || "C";

    return (
      <div className="min-h-screen flex flex-col bg-[#F8FAFC] font-sans antialiased text-charcoal">
        <StoreHeader />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handlePhotoUpload}
        />

        <main className="flex-1 py-6 sm:py-10">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Breadcrumb Navigation */}
            <nav className="flex items-center gap-2 text-xs text-charcoal-light mb-5 font-medium">
              <Link href="/" className="hover:text-peach-dark transition-colors">
                Home
              </Link>
              <span className="text-slate-300">/</span>
              <Link href="/store" className="hover:text-peach-dark transition-colors">
                Store
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-bold text-charcoal">
                {activeTab === "orders" && "Purchases"}
                {activeTab === "profile" && "Profile Setting"}
                {activeTab === "statement" && "Account Statement"}
              </span>
            </nav>

            {/* Simple & Plain Page Header */}
            <div className="mb-6 pb-4 border-b border-slate-200">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-charcoal tracking-tight font-display">
                {activeTab === "orders" && "Purchases"}
                {activeTab === "profile" && "Profile Setting"}
                {activeTab === "statement" && "Account Statement"}
              </h1>
              <p className="text-xs sm:text-sm text-charcoal-light mt-1">
                {activeTab === "orders" && "Review your past tool orders, live delivery tracking, and receipts."}
                {activeTab === "profile" && "Manage your name, phone number, photo, and jobsite delivery address."}
                {activeTab === "statement" && "Audit records of your invoices, payments, and account balances."}
              </p>
            </div>

            {/* ========================================================================= */}
            {/* TAB 1: PURCHASES & RECEIPTS                                              */}
            {/* ========================================================================= */}
            {activeTab === "orders" && (
              <div className="space-y-6">
                {/* 3 Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Card 1: Orders Placed */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider">
                        Total Orders Placed
                      </span>
                      <div className="w-9 h-9 rounded-2xl bg-peach-xlight text-peach-dark flex items-center justify-center">
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-2xl font-black text-charcoal font-display">
                      {orders.length} <span className="text-sm font-semibold text-charcoal-light">completed</span>
                    </p>
                    <p className="text-[11px] text-charcoal-light mt-1 flex items-center gap-1 font-medium">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Direct jobsite dispatch history
                    </p>
                  </div>

                  {/* Card 2: Total Equipment Spend */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider">
                        Total Equipment Spend
                      </span>
                      <div className="w-9 h-9 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-2xl font-black text-charcoal font-display">
                      {formatCurrency(totalSpent)}
                    </p>
                    <p className="text-[11px] text-charcoal-light mt-1 font-medium">
                      Audited tax deductible equipment
                    </p>
                  </div>

                  {/* Card 3: Tax Invoices Sync */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs hover:shadow-xs transition-shadow">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider">
                        Automated Receipts
                      </span>
                      <div className="w-9 h-9 rounded-2xl bg-sky-50 text-sky-600 flex items-center justify-center">
                        <svg className="w-4.5 h-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-emerald-700 truncate mt-1 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                      <span className="truncate">{email || customer.email}</span>
                    </p>
                    <p className="text-[11px] text-charcoal-light mt-2 font-medium">
                      Sent automatically with every order
                    </p>
                  </div>
                </div>

                {/* Search & Filter Toolbar (Search, Filter by Date, Filter by Status, Sort) */}
                {orders.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs space-y-3">
                    <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
                      {/* Search Input */}
                      <div className="relative flex-1">
                        <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          type="text"
                          value={orderSearchQuery}
                          onChange={(e) => setOrderSearchQuery(e.target.value)}
                          placeholder="Search purchases by tool name, SKU, or order #..."
                          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50/60 focus:bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-peach-dark/30 transition-all placeholder:text-slate-400"
                        />
                        {orderSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setOrderSearchQuery("")}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-charcoal text-xs font-bold"
                          >
                            ✕
                          </button>
                        )}
                      </div>

                      {/* Dropdown Filters Group */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* 1. Date Filter Select */}
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="dateFilterSelect" className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider shrink-0 hidden sm:inline">
                            Date:
                          </label>
                          <select
                            id="dateFilterSelect"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-charcoal transition-colors cursor-pointer"
                          >
                            <option value="ALL">All Dates</option>
                            <option value="TODAY">Today</option>
                            <option value="THIS_WEEK">Last 7 Days</option>
                            <option value="30_DAYS">Last 30 Days</option>
                            <option value="3_MONTHS">Last 3 Months</option>
                            <option value="THIS_YEAR">This Year</option>
                            <option value="CUSTOM">Custom Date Range...</option>
                          </select>
                        </div>

                        {/* 2. Status Filter Select */}
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="statusFilterSelect" className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider shrink-0 hidden sm:inline">
                            Status:
                          </label>
                          <select
                            id="statusFilterSelect"
                            value={orderStatusFilter}
                            onChange={(e) => setOrderStatusFilter(e.target.value)}
                            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-charcoal transition-colors cursor-pointer"
                          >
                            <option value="ALL">All Statuses ({orders.length})</option>
                            <option value="DELIVERED">Delivered</option>
                            <option value="DISPATCHED">Dispatched</option>
                            <option value="PROCESSING">Processing</option>
                            <option value="CANCELLED">Cancelled</option>
                          </select>
                        </div>

                        {/* 3. Sort Order Select */}
                        <div className="flex items-center gap-1.5">
                          <label htmlFor="sortOrderSelect" className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider shrink-0 hidden sm:inline">
                            Sort:
                          </label>
                          <select
                            id="sortOrderSelect"
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value as "NEWEST" | "OLDEST")}
                            className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-charcoal transition-colors cursor-pointer"
                          >
                            <option value="NEWEST">Newest First</option>
                            <option value="OLDEST">Oldest First</option>
                          </select>
                        </div>

                        {/* Reset Filters button if any active filter */}
                        {(dateFilter !== "ALL" || orderStatusFilter !== "ALL" || orderSearchQuery || startDate || endDate) && (
                          <button
                            type="button"
                            onClick={() => {
                              setDateFilter("ALL");
                              setOrderStatusFilter("ALL");
                              setOrderSearchQuery("");
                              setStartDate("");
                              setEndDate("");
                              setSortOrder("NEWEST");
                            }}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-charcoal-light hover:text-charcoal text-xs font-bold transition-colors shrink-0"
                            title="Reset all filters"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Custom Date Range Row (Shown when "CUSTOM" date selected) */}
                    {dateFilter === "CUSTOM" && (
                      <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs bg-slate-50/60 p-3 rounded-xl animate-in fade-in duration-150">
                        <span className="font-bold text-charcoal-light uppercase tracking-wider text-[11px]">
                          Select Date Range:
                        </span>
                        <div className="flex items-center gap-2">
                          <label className="text-charcoal-light font-medium">From:</label>
                          <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-charcoal"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-charcoal-light font-medium">To:</label>
                          <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-charcoal"
                          />
                        </div>
                        {(startDate || endDate) && (
                          <button
                            type="button"
                            onClick={() => {
                              setStartDate("");
                              setEndDate("");
                            }}
                            className="text-peach-dark hover:underline font-bold text-xs"
                          >
                            Clear Dates
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Orders Content */}
                {ordersLoading ? (
                  <div className="bg-white rounded-3xl p-16 text-center border border-slate-200/90 shadow-2xs">
                    <div className="w-10 h-10 border-3 border-peach-dark border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm font-bold text-charcoal">Loading your equipment orders...</p>
                    <p className="text-xs text-charcoal-light mt-1 font-medium">Syncing dispatch and tax receipt records</p>
                  </div>
                ) : orders.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 sm:p-16 text-center border border-slate-200 max-w-lg mx-auto shadow-2xs">
                    <div className="w-18 h-18 rounded-3xl bg-peach-xlight text-peach-dark flex items-center justify-center mx-auto mb-4 border border-peach-light/70">
                      <svg className="w-9 h-9" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                      </svg>
                    </div>
                    <h3 className="text-xl font-extrabold text-charcoal mb-2 font-display">No purchases placed yet</h3>
                    <p className="text-xs sm:text-sm text-charcoal-light mb-6 leading-relaxed font-medium">
                      When you order industrial equipment, your purchases will appear here with live dispatch updates and automated tax receipts delivered directly to your email.
                    </p>
                    <Link
                      href="/store"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-peach-dark hover:bg-peach-deep text-white font-bold text-xs uppercase tracking-wider rounded-2xl transition-all shadow-md active:scale-98"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                      Browse Oceanic Tools Store
                    </Link>
                  </div>
                ) : filteredOrders.length === 0 ? (
                  <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/90 shadow-2xs">
                    <p className="text-sm font-bold text-charcoal">No purchases match your search or filter</p>
                    <p className="text-xs text-charcoal-light mt-1 mb-4">Try clearing your search query or switching filters.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setOrderSearchQuery("");
                        setOrderStatusFilter("ALL");
                        setDateFilter("ALL");
                        setStartDate("");
                        setEndDate("");
                        setSortOrder("NEWEST");
                      }}
                      className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-charcoal transition-colors"
                    >
                      Reset Filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {filteredOrders.map((order) => (
                      <div
                        key={order.id}
                        data-print-order={order.id}
                        className="bg-white rounded-3xl border border-slate-200/90 shadow-xs hover:border-peach-light/70 hover:shadow-md transition-all overflow-hidden"
                      >
                        {/* Order Card Top Bar */}
                        <div className="bg-slate-50/80 px-5 sm:px-6 py-4 border-b border-slate-200/70 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex flex-wrap items-center gap-3">
                            {/* Order Number Badge */}
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs">
                              <span className="font-mono font-bold text-charcoal text-xs sm:text-sm">
                                #{order.number}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleCopyOrderNumber(order.number)}
                                className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-charcoal transition-colors"
                                title="Copy order number"
                              >
                                {copiedOrderId === order.number ? (
                                  <span className="text-[10px] text-emerald-600 font-bold">Copied!</span>
                                ) : (
                                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                )}
                              </button>
                            </div>

                            <span className="text-xs text-charcoal-light font-medium flex items-center gap-1.5">
                              <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDate(order.createdAt)}
                            </span>

                            {getStatusBadge(order.status)}
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span className="text-[10px] text-charcoal-light font-bold uppercase tracking-wider block">
                                Total Paid
                              </span>
                              <span className="font-display font-black text-base sm:text-lg text-charcoal">
                                {formatCurrency(order.total)}
                              </span>
                            </div>

                            <button
                              type="button"
                                onClick={() => printFocusedLayout(`[data-print-order="${CSS.escape(order.id)}"]`)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-xs font-bold text-charcoal transition-colors shadow-2xs active:scale-98"
                              title="Print order receipt"
                            >
                              <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                              </svg>
                              Receipt
                            </button>
                          </div>
                        </div>

                        {/* Order Line Items */}
                        <div className="p-5 sm:p-6 divide-y divide-slate-100">
                          {order.lines.map((line) => {
                            const unitPrice = typeof line.unitPrice === "string" ? parseFloat(line.unitPrice) : line.unitPrice;
                            const lineTotal = typeof line.lineTotal === "string" ? parseFloat(line.lineTotal) : line.lineTotal;
                            const thumbUrl = line.product?.imageUrl || line.product?.productImages?.[0]?.mediaAsset?.secureUrl;
                            const isReordered = reorderedLineId === line.id;

                            return (
                              <div key={line.id} className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                  {/* Product Thumbnail */}
                                  <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200/80 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                                    {thumbUrl ? (
                                      <img
                                        src={thumbUrl}
                                        alt={line.productName}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 3.193l-.865.965" />
                                      </svg>
                                    )}
                                  </div>

                                  <div>
                                    <h4 className="text-sm font-bold text-charcoal leading-snug">
                                      {line.productName}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-2 mt-1">
                                      <span className="font-mono text-[11px] font-semibold text-charcoal-light bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                                        {line.sku}
                                      </span>
                                      <span className="text-xs text-charcoal-light font-medium">
                                        Qty: <strong className="text-charcoal">{line.quantity}</strong> × {formatCurrency(unitPrice)}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                                  <span className="font-mono font-black text-sm sm:text-base text-charcoal sm:text-right">
                                    {formatCurrency(lineTotal)}
                                  </span>

                                  <button
                                    type="button"
                                    onClick={() => handleReorder(line)}
                                    className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 shadow-2xs active:scale-95 ${
                                      isReordered
                                        ? "bg-emerald-600 text-white"
                                        : "bg-peach-xlight hover:bg-peach-light/70 text-peach-dark"
                                    }`}
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                                    </svg>
                                    {isReordered ? "Added!" : "Buy Again"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Order Card Footer */}
                        <div className="bg-slate-50/60 px-5 sm:px-6 py-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                          {/* Left: Email Receipt Status */}
                          <div className="flex items-center gap-2 text-emerald-800 font-semibold">
                            <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                            <span>Tax receipt dispatched to <strong className="font-bold">{email || customer.email}</strong></span>
                          </div>

                          {/* Right: Fulfillment & Destination */}
                          <div className="flex items-center gap-1.5 text-charcoal-light font-medium">
                            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            <span>
                              {order.fulfillmentMethod === "DELIVERY"
                                ? `Destination: ${order.deliveryAddress || "Registered jobsite address"}`
                                : "Self pickup at Oceanic Tools warehouse"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================================= */}
            {/* TAB 2: PROFILE & DELIVERY SETTINGS                                       */}
            {/* ========================================================================= */}
            {activeTab === "profile" && (
              <div className="max-w-2xl bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
                <div className="mb-6 pb-5 border-b border-slate-100">
                  <h2 className="text-xl font-bold text-charcoal font-display">Profile & Delivery Details</h2>
                  <p className="text-xs text-charcoal-light mt-1 font-medium">
                    Update your photo, contact info, and default jobsite address used for deliveries.
                  </p>
                </div>

                {actionSuccess && (
                  <div className="mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-1">
                    <svg className="w-4.5 h-4.5 text-emerald-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span>{actionSuccess}</span>
                  </div>
                )}

                {/* Photo Upload Section */}
                <div className="mb-6 p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center gap-4">
                  <div className="relative w-18 h-18 rounded-2xl overflow-hidden bg-peach-dark text-white font-black text-2xl flex items-center justify-center ring-2 ring-peach-light/80 shadow-2xs shrink-0">
                    {customer.avatarUrl ? (
                      <img src={customer.avatarUrl} alt={customer.name} className="w-full h-full object-cover" />
                    ) : (
                      <span>{initial}</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="text-xs font-bold text-charcoal">Profile Photo</h4>
                    <p className="text-[11px] text-charcoal-light mt-0.5">Square JPG, PNG, or WebP up to 5MB</p>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-peach-dark hover:bg-peach-xlight transition-colors shadow-2xs"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {customer.avatarUrl ? "Change Photo" : "Upload Photo"}
                    </button>
                  </div>
                </div>

                <form onSubmit={handleProfileSave} className="space-y-5 text-xs">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-bold text-charcoal uppercase tracking-wider mb-2">
                      Full Name / Contracting Firm Name
                    </label>
                    <div className="relative">
                      <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      <input
                        type="text"
                        required
                        value={profileName}
                        onChange={(e) => setProfileName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-sm font-medium transition-all"
                        placeholder="e.g. Adebayo Construction & Tools Ltd"
                      />
                    </div>
                  </div>

                  {/* Email (Locked) */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-xs font-bold text-charcoal uppercase tracking-wider">
                        Email Address (Locked)
                      </label>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Protected</span>
                    </div>
                    <div className="relative">
                      <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                      <input
                        type="email"
                        disabled
                        value={email || customer.email}
                        className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-200 bg-slate-50 text-slate-500 text-sm font-medium cursor-not-allowed"
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-light mt-1.5 font-medium">
                      Used for dispatch alerts and automated tax invoices.
                    </p>
                  </div>

                  {/* Phone Number */}
                  <div>
                    <label className="block text-xs font-bold text-charcoal uppercase tracking-wider mb-2">
                      Dispatch Phone Number
                    </label>
                    <div className="relative">
                      <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <input
                        type="tel"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(e.target.value)}
                        placeholder="+234 800 000 0000"
                        className="w-full pl-10 pr-4 py-3 rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-sm font-medium transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-light mt-1.5 font-medium">
                      Logistics drivers will call this number when arriving at your site.
                    </p>
                  </div>

                  {/* Default Jobsite Address */}
                  <div>
                    <label className="block text-xs font-bold text-charcoal uppercase tracking-wider mb-2">
                      Default Jobsite / Delivery Destination
                    </label>
                    <div className="relative">
                      <textarea
                        rows={3}
                        value={profileAddress}
                        onChange={(e) => setProfileAddress(e.target.value)}
                        placeholder="Plot number, Street address, Site Name/Superintendent, City, State"
                        className="w-full p-4 rounded-2xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-peach-dark/30 text-sm font-medium resize-none transition-all"
                      />
                    </div>
                    <p className="text-[11px] text-charcoal-light mt-1.5 font-medium">
                      Pre-fills at checkout so you can reorder equipment quickly.
                    </p>
                  </div>

                  {/* Submit Button */}
                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={profileUpdating}
                      className="w-full py-3.5 bg-peach-dark hover:bg-peach-deep text-white font-extrabold rounded-2xl text-xs uppercase tracking-wider transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98"
                    >
                      {profileUpdating ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>Saving Changes...</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Save Profile Details</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
            {/* ========================================================================= */}
            {/* TAB 3: ACCOUNT STATEMENT & INVOICES                                      */}
            {/* ========================================================================= */}
            {activeTab === "statement" && (
              <div className="space-y-6">
                {/* Statement Summary Metrics */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Total Invoiced */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs">
                    <span className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider block">
                      Total Invoiced Amount
                    </span>
                    <p className="text-2xl font-black text-charcoal font-display mt-1">
                      {formatCurrency(statementTotalInvoiced)}
                    </p>
                    <p className="text-[11px] text-charcoal-light mt-1 font-medium">
                      All equipment invoices
                    </p>
                  </div>

                  {/* Total Paid */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs">
                    <span className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider block">
                      Total Amount Settled
                    </span>
                    <p className="text-2xl font-black text-emerald-700 font-display mt-1">
                      {formatCurrency(statementTotalPaid)}
                    </p>
                    <p className="text-[11px] text-charcoal-light mt-1 font-medium flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Verified payments cleared
                    </p>
                  </div>

                  {/* Outstanding Balance */}
                  <div className="bg-white rounded-3xl p-5 border border-slate-200/90 shadow-2xs">
                    <span className="text-[11px] font-bold text-charcoal-light uppercase tracking-wider block">
                      Outstanding Balance
                    </span>
                    <p
                      className={`text-2xl font-black font-display mt-1 ${
                        statement?.outstanding && statement.outstanding > 0 ? "text-amber-600" : "text-emerald-700"
                      }`}
                    >
                      {formatCurrency(statement?.outstanding || 0)}
                    </p>
                    <p className="text-[11px] text-charcoal-light mt-1 font-medium">
                      {statement?.outstanding && statement.outstanding > 0
                        ? "Pending invoice settlement"
                        : "Account in good standing (Zero Balance)"}
                    </p>
                  </div>
                </div>

                {/* Statement Ledger Container */}
                <div data-print-statement className="bg-white rounded-3xl border border-slate-200/90 p-6 sm:p-8 shadow-xs">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-5 border-b border-slate-100">
                    <div>
                      <h2 className="text-xl font-bold text-charcoal font-display">Official Accounting Ledger</h2>
                      <p className="text-xs text-charcoal-light mt-1 font-medium">
                        Itemized financial records of all equipment purchases, invoices, and payments.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => printFocusedLayout("[data-print-statement]")}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-charcoal transition-colors shadow-2xs active:scale-98"
                    >
                      <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Print Statement
                    </button>
                  </div>

                  {statementLoading ? (
                    <div className="p-12 text-center">
                      <div className="w-9 h-9 border-3 border-peach-dark border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                      <p className="text-sm font-bold text-charcoal">Loading accounting statement...</p>
                    </div>
                  ) : !statement || statement.entries.length === 0 ? (
                    <div className="py-12 px-4 text-center max-w-md mx-auto">
                      <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h4 className="text-sm font-bold text-charcoal">No accounting records found</h4>
                      <p className="text-xs text-charcoal-light mt-1 mb-5 font-medium">
                        Your statement will automatically record each invoice once you complete orders in the store.
                      </p>
                      <Link
                        href="/store"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-peach-dark hover:bg-peach-deep text-white font-bold text-xs"
                      >
                        Explore Tools Catalog
                      </Link>
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full text-left text-xs font-sans">
                          <thead>
                            <tr className="border-b border-slate-200 text-[11px] font-bold text-charcoal-light uppercase tracking-wider bg-slate-50/50">
                              <th className="py-3.5 px-4 rounded-l-xl">Date</th>
                              <th className="py-3.5 px-4">Invoice Reference</th>
                              <th className="py-3.5 px-4 text-right">Invoice Total</th>
                              <th className="py-3.5 px-4 text-right">Amount Settled</th>
                              <th className="py-3.5 px-4 text-right">Balance Due</th>
                              <th className="py-3.5 px-4 text-center rounded-r-xl">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {statement.entries.map((item) => {
                              const balanceVal = typeof item.balance === "string" ? parseFloat(item.balance) : item.balance;
                              const isPaid = balanceVal <= 0;

                              return (
                                <tr key={item.saleId} className="hover:bg-slate-50/70 transition-colors">
                                  <td className="py-4 px-4 text-charcoal-light font-medium">{formatDate(item.date)}</td>
                                  <td className="py-4 px-4 font-mono font-bold text-charcoal">{item.number}</td>
                                  <td className="py-4 px-4 text-right font-mono font-semibold text-charcoal">{formatCurrency(item.total)}</td>
                                  <td className="py-4 px-4 text-right font-mono font-bold text-emerald-700">{formatCurrency(item.paid)}</td>
                                  <td className="py-4 px-4 text-right font-mono font-bold text-charcoal">{formatCurrency(item.balance)}</td>
                                  <td className="py-4 px-4 text-center">
                                    {isPaid ? (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                        Paid in Full
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                        Balance Due
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Cards View */}
                      <div className="sm:hidden space-y-3">
                        {statement.entries.map((item) => {
                          const balanceVal = typeof item.balance === "string" ? parseFloat(item.balance) : item.balance;
                          const isPaid = balanceVal <= 0;

                          return (
                            <div key={item.saleId} className="p-4 rounded-2xl border border-slate-200/80 bg-slate-50/50 space-y-2 text-xs">
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-charcoal">{item.number}</span>
                                {isPaid ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    Paid in Full
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                    Balance Due
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center justify-between text-charcoal-light font-medium">
                                <span>Date: {formatDate(item.date)}</span>
                                <span className="font-mono text-charcoal font-bold">{formatCurrency(item.total)}</span>
                              </div>
                              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                                <span className="text-emerald-700 font-bold">Paid: {formatCurrency(item.paid)}</span>
                                <span className="font-bold text-charcoal">Balance: {formatCurrency(item.balance)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>

        <StoreFooter />
        <MobileBottomNav />
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // VIEW 2: SPLIT-SCREEN AUTHENTICATION (TOOLS IMAGE LEFT • SIMPLE FORM RIGHT)
  // (Identical layout to dashboard login • clean • distraction-free)
  // -------------------------------------------------------------------------
  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f6f4] lg:place-items-stretch lg:grid-cols-[0.9fr_1.1fr]">
      {/* Left Column: Industrial Tools Photography & Store Branding */}
      <section className="relative hidden overflow-hidden lg:order-1 lg:block lg:min-h-screen">
        <Image
          src="/workshop-drill.jpg"
          alt="Industrial power tools and workshop equipment"
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 50vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1715ed] via-[#10241e75] to-[#10241e12]" />
        <div className="absolute inset-x-0 bottom-0 max-w-3xl p-8 text-white xl:p-14">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#10241e66] px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-lg backdrop-blur-md transition-colors hover:bg-[#10241e99]"
          >
            <img src="/oceantoolslogo.png" alt="Oceanic Tools" className="h-5 w-auto object-contain brightness-0 invert" />
            <span>Oceanic Tools Monger</span>
          </Link>
          <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight text-white xl:text-5xl">
            Genuine Industrial Tools & Jobsite Supplies
          </h1>
          <p className="mb-0 mt-5 max-w-xl text-base leading-7 text-white/90">
            Sign in to track orders, access invoices, and have receipts automatically delivered to your email.
          </p>
        </div>
      </section>

      {/* Right Column: Simple & Fast Storefront Sign In / Register */}
      <section className="order-2 flex w-full items-center justify-center p-4 sm:p-10 lg:order-2 lg:p-14">
        <div className="w-full max-w-md rounded-3xl border border-slate-200/90 bg-white p-6 shadow-lg sm:p-10">
          {/* Header */}
          <div className="mb-6">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#149e8f] block mb-1">
              Storefront Customer Portal
            </span>
            <h2 className="text-2xl font-bold tracking-tight text-[#172720]">
              {mode === "signin" ? "Sign In to Your Account" : "Create Customer Account"}
            </h2>
            <p className="mt-1 text-xs text-[#68766e]">
              {mode === "signin"
                ? "Access your purchases, invoices, and jobsite deliveries."
                : "Register for automated receipts and direct jobsite reordering."}
            </p>
          </div>

          {mode === "signin" && (
            <>
              {/* Google sign-in is available only for existing customer accounts. */}
              <div className="mb-5">
                <GoogleSignInButton
                  onSuccess={handleGoogleSuccess}
                  onError={() => console.warn("Google sign in error")}
                  text="signin_with"
                />
              </div>

              <div className="relative my-5 flex items-center justify-center">
                <div className="w-full border-t border-[#dfe6e0]" />
                <span className="absolute bg-white px-3 text-[11px] font-bold uppercase tracking-wider text-[#9aa49d]">
                  or with email
                </span>
              </div>
            </>
          )}

          {/* Error Message */}
          {authError && (
            <div className="mb-4 rounded-xl border border-[#d95d43]/30 bg-[#fff5f2] p-3 text-xs text-[#a03622]">
              {authError}
            </div>
          )}

          {/* Forms */}
          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="grid gap-3.5">
              <label className="grid gap-1.5 text-xs font-bold text-[#34413a] uppercase tracking-wider">
                Email Address
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="contractor@company.com"
                  className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                />
              </label>

              <div className="grid gap-1.5 text-xs font-bold text-[#34413a] uppercase tracking-wider">
                <div className="flex items-center justify-between">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="text-[11px] font-semibold text-[#149e8f] hover:text-[#108578] lowercase tracking-normal"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="Your account password"
                  className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 h-11 w-full bg-peach-dark hover:bg-peach-deep text-white font-bold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center disabled:opacity-50"
              >
                {authLoading ? "Signing in..." : "Sign In to Store"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="grid gap-3.5">
              <label className="grid gap-1.5 text-xs font-bold text-[#34413a] uppercase tracking-wider">
                Full Name / Contracting Firm
                <input
                  type="text"
                  required
                  value={authName}
                  onChange={(e) => setAuthName(e.target.value)}
                  placeholder="e.g. John Doe / Builder Ltd"
                  className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-[#34413a] uppercase tracking-wider">
                Email Address
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="contractor@company.com"
                  className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                />
              </label>

              <label className="grid gap-1.5 text-xs font-bold text-[#34413a] uppercase tracking-wider">
                Phone Number <span className="text-[#9aa49d] font-normal lowercase">(optional)</span>
                <input
                  type="tel"
                  value={authPhone}
                  onChange={(e) => setAuthPhone(e.target.value)}
                  placeholder="+234 800 000 0000"
                  className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                />
              </label>

              <div className="grid gap-1.5 text-xs font-bold text-[#34413a] uppercase tracking-wider">
                <div className="flex items-center justify-between">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="text-[11px] font-semibold text-[#149e8f] hover:text-[#108578] lowercase tracking-normal"
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="mt-2 h-11 w-full bg-peach-dark hover:bg-peach-deep text-white font-bold text-sm rounded-xl transition-colors shadow-xs flex items-center justify-center disabled:opacity-50"
              >
                {authLoading ? "Creating account..." : "Create Customer Account"}
              </button>
            </form>
          )}

          {/* Toggle link */}
          <div className="mt-6 pt-4 border-t border-[#dfe6e0] text-center text-xs text-[#68766e]">
            {mode === "signin" ? (
              <p>
                Don&apos;t have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    clearError();
                  }}
                  className="font-bold text-peach-dark hover:underline"
                >
                  Create one now
                </button>
              </p>
            ) : (
              <p>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    clearError();
                  }}
                  className="font-bold text-peach-dark hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
