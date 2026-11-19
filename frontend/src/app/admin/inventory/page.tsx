"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { useInventoryOverview } from "@/hooks/queries/use-inventory-overview";
import { useBranchStore } from "@/stores/branch.store";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { AppErrorModal } from "@/components/app-error-modal";
import { AppSuccessModal } from "@/components/app-success-modal";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { FourDotLoader } from "@/components/four-dot-loader";
import { changeStockLotCondition } from "@/services/inventory/inventory.service";
import { useInventoryWorkflow } from "@/hooks/mutations/use-inventory-workflow";
import { smartSearchMatch } from "@/lib/smart-search";

type User = { id: string; name: string; email: string; role: string; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null; branchId?: string | null };
type Branch = { id: string; name: string; isDefault: boolean };
type Product = { id: string; name: string; sku: string; unit?: string; brand?: string | null; model?: string | null; category?: string; specifications?: Array<{ name: string; value: string }>; };
type Balance = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
  brand?: string | null;
  model?: string | null;
  specifications?: Array<{ name: string; value: string }>;
  imageUrl?: string | null;
  branch: string;
  branchId?: string;
  updatedAt?: string;
  onHand: number | string;
  reserved: number | string;
  available: number | string;
  reorderLevel: number | string;
};
type Movement = {
  id: string;
  type: string;
  quantity: number | string;
  createdAt: string;
  reference?: string | null;
  reason?: string | null;
  product: Product;
  branch: { name: string };
  user?: { name: string };
};
type Transfer = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  sourceBranch: { name: string };
  destinationBranch: { name: string };
  lines: { id: string; product: Product; quantity: number | string; receivedQuantity?: number | string | null; discrepancyReason?: string | null }[];
};
type Count = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  branch: { name: string };
  createdBy: { name: string; email: string };
  approvedBy?: { name: string; email: string } | null;
  postedBy?: { name: string; email: string } | null;
  reason?: string | null;
  lines: {
    product: Product;
    systemQuantity: number | string;
    countedQuantity: number | string;
    variance: number | string;
  }[];
};
type Lot = {
  id: string;
  product: Product;
  batchNumber?: string | null;
  expiresAt?: string | null;
  quantity: number | string;
  reserved: number | string;
  available: number | string;
  origin: string;
  condition: "GOOD" | "DAMAGED" | "QUARANTINED" | "EXPIRED";
};
type Summary = {
  data: Balance[];
  summary: {
    productCount: number;
    onHandUnits: number;
    reservedUnits: number;
    availableUnits: number;
    lowStockCount: number;
    outOfStockCount: number;
    expiringWithin30Days: number;
    availableProductCount?: number;
  };
};
type ProductStock = Omit<Balance, "branch" | "branchId" | "onHand" | "reserved" | "available"> & {
  updatedAt?: string;
  branches: Array<{ id?: string; name: string; onHand: number; reserved: number; available: number }>;
  onHand: number;
  reserved: number;
  available: number;
};
const manageable = (user?: User) =>
  user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");
const fmt = (value: number | string) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(
    Number(value),
  );
const date = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function InventoryPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const branchesQuery = useBranches<Branch>();
  const productsQuery = useProducts("");
  const branches = branchesQuery.data?.data ?? [];
  const products = productsQuery.data?.data ?? [];
  const branchId = useBranchStore((state) => state.selectedBranchId);
  const branchSelectionInitialized = useBranchStore((state) => state.branchSelectionInitialized);
  const setBranchId = useBranchStore((state) => state.setSelectedBranchId);
  const initializeBranchSelection = useBranchStore((state) => state.initializeBranchSelection);
  const inventoryQuery = useInventoryOverview<Summary, Movement, Transfer, Count, Lot>(
    branchId,
    Boolean(user && (branchId || branches.length === 0)),
  );
  const workflowMutation = useInventoryWorkflow();
  const summary = inventoryQuery.data?.summary;
  const movements = inventoryQuery.data?.movements ?? [];
  const lots = inventoryQuery.data?.lots ?? [];
  const loading = inventoryQuery.isLoading;
  const error = inventoryQuery.error instanceof Error
    ? inventoryQuery.error.message
    : inventoryQuery.isError
      ? "Inventory could not be loaded."
      : "";
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [productPage, setProductPage] = useState(1);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(() => new Set());

  const loadData = useCallback(() => inventoryQuery.refetch(), [inventoryQuery.refetch]);

  useEffect(() => {
    if (!user || !branches.length) return;
    if (user.role === "STAFF" && user.branchId) {
      if (branchId !== user.branchId) setBranchId(user.branchId);
      return;
    }
    if (!branchSelectionInitialized) {
      const initial = branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? "";
      initializeBranchSelection(initial);
    }
  }, [user, branchId, branchSelectionInitialized, branches, setBranchId, initializeBranchSelection]);

  async function action(key: string, request: () => Promise<unknown>) {
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      await workflowMutation.mutateAsync(request);
      setNotice("Inventory workflow updated successfully.");
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "The inventory action failed.",
      );
    } finally {
      setBusy("");
    }
  }

  async function changeLotCondition(event: React.FormEvent<HTMLFormElement>, lot: Lot) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(`lot-${lot.id}`, () => changeStockLotCondition(lot.id, {
      condition: form.get("condition"),
      reason: form.get("reason"),
    }));
  }

  if (!user)
    return <AdminPageSkeleton />;
  const canManage = manageable(user);
  const stockRows = summary?.data ?? [];
  const categories = [...new Set(stockRows.map((row) => row.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const groupedStockRows = useMemo(() => {
    const grouped = new Map<string, ProductStock>();
    for (const row of stockRows) {
      const current = grouped.get(row.productId);
      const branch = { id: row.branchId, name: row.branch, onHand: Number(row.onHand), reserved: Number(row.reserved), available: Number(row.available) };
      if (current) {
        current.branches.push(branch);
        current.onHand += branch.onHand;
        current.reserved += branch.reserved;
        current.available += branch.available;
      } else {
        grouped.set(row.productId, { ...row, branches: [branch], onHand: branch.onHand, reserved: branch.reserved, available: branch.available });
      }
    }
    return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [stockRows]);
  const filteredStockRows = groupedStockRows.filter((row) => {
    const product = products.find((p) => p.id === row.productId);
    const matchesSearch = smartSearchMatch(
      [
        row.name,
        row.sku,
        row.category,
        row.unit,
        row.brand ?? product?.brand,
        row.model ?? product?.model,
        ...(row.specifications?.map((s) => `${s.name} ${s.value}`) ?? []),
        ...(product?.specifications?.map((s) => `${s.name} ${s.value}`) ?? []),
      ],
      productSearch
    );
    const isOut = row.available <= 0;
    const isLow = !isOut && Number(row.reorderLevel) > 0 && row.available <= Number(row.reorderLevel);
    const matchesStatus = stockStatusFilter === "all" || (stockStatusFilter === "out" ? isOut : stockStatusFilter === "low" ? isLow : !isOut && !isLow);
    return matchesSearch && matchesStatus && (!categoryFilter || row.category === categoryFilter);
  });
  const availableByUnit = [...groupedStockRows.reduce((totals, row) => {
    const current = totals.get(row.unit) ?? { quantity: 0, items: [] as string[] };
    current.quantity += row.available;
    current.items.push(`${row.name} (${fmt(row.available)} ${row.unit})`);
    totals.set(row.unit, current);
    return totals;
  }, new Map<string, { quantity: number; items: string[] }>())];
  const productPageSize = 30;
  const productPageCount = Math.max(1, Math.ceil(filteredStockRows.length / productPageSize));
  const visibleStockRows = filteredStockRows.slice((productPage - 1) * productPageSize, productPage * productPageSize);
  useEffect(() => { if (productPage > productPageCount) setProductPage(productPageCount); }, [productPage, productPageCount]);
  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">
                STOCK CONTROL
              </span>
              <h1>Stock</h1>
              <p>
                Check stock in each shop, fix count differences and track stock
                moves.
              </p>
            </div>
            <label className="flex items-center gap-2 [&>span]:text-sm [&>span]:text-[#919b95] [&_select]:h-[30px] [&_select]:border border-[#e4e9e4] [&_select]:rounded-md [&_select]:bg-white [&_select]:text-[#3e4e45] [&_select]:py-0 px-2 [&_select]:text-sm [&_select]:[outline:0] [&_select:focus]:[border-color:#73a48a] [&_select:focus]:shadow-[0_0_0_2px_#eaf3ec] max-[620px]:[flex:1] max-[620px]:grid max-[620px]:gap-1 max-[620px]:[&_select]:w-full flex items-center gap-2 text-[#77847b] text-sm [&_select]:h-[34px] [&_select]:max-w-[200px] [&_select]:border border-[#e1e8e2] [&_select]:rounded-md [&_select]:bg-white [&_select]:py-0 px-[9px] [&_select]:text-[#435249] [&_select]:text-sm max-[620px]:[&_select]:max-w-[135px] max-[620px]:[&_select]:h-[31px] max-[620px]:[&_select]:text-sm">
              Branch
              <select
                value={user.role === "STAFF" ? user.branchId ?? "" : branchId}
                disabled={user.role === "STAFF"}
                onChange={(event) => setBranchId(event.target.value)}
              >
                {user.role === "OWNER" && <option value="">All branches</option>}
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {error && (
            <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55] [&_strong]:text-[#a5554a] [&_p]:text-[#8e7974]">
              <strong>Inventory unavailable</strong>
              <p>{error}</p>
              <button
                className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                onClick={() => void loadData()}
              >
                Try again
              </button>
            </div>
          )}
          <section className="grid grid-cols-5 gap-3 mb-4 max-[1000px]:grid-cols-3 max-[620px]:grid-cols-2 max-[620px]:gap-2">
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-xs [&>span]:text-[#75827a] [&>span]:font-semibold [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-xs [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>Products stocked</span>
              <strong>
                {loading ? "" : (summary?.summary.productCount ?? 0)}
              </strong>
              <small>In selected branch scope</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-xs [&>span]:text-[#75827a] [&>span]:font-semibold [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-xs [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>Products available</span>
              <strong>
                {loading ? "" : (summary?.summary.availableProductCount ?? 0)}
              </strong>
              <small>Products with stock ready to sell</small>
            </article>
            <article className="grid min-h-[106px] min-w-0 content-start gap-2 overflow-hidden rounded-xl border border-line bg-white p-4 max-[620px]:min-h-[91px] max-[620px]:p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[#75827a]">Available units</span>
                {!!availableByUnit.length && <small className="shrink-0 text-[10px] text-[#9aa49d]">{availableByUnit.length} types</small>}
              </div>
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-1 [scrollbar-width:thin]" aria-label="Available stock by unit">
                {loading ? <span className="text-sm text-[#87948b]">Loading…</span> : availableByUnit.length ? availableByUnit.map(([unit, total]) => <span key={unit} title={`${fmt(total.quantity)} ${unit} total\n${total.items.join("\n")}`} aria-label={`${fmt(total.quantity)} ${unit} total. Includes: ${total.items.join(", ")}`} className="inline-flex shrink-0 items-baseline gap-1 rounded-md bg-[#f2f6f2] px-2 py-1 text-sm font-semibold leading-none text-[#304438]">{fmt(total.quantity)}<small className="text-[10px] font-medium text-[#718077]">{unit}</small></span>) : <span className="rounded-md bg-[#f2f6f2] px-2 py-1 text-sm font-semibold leading-none text-[#304438]">0</span>}
              </div>
              <small className="text-xs text-[#9aa49d]">On hand</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-xs [&>span]:text-[#75827a] [&>span]:font-semibold [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-xs [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#a6782c]">
              <span>Low stock</span>
              <strong>
                {loading ? "" : (summary?.summary.lowStockCount ?? 0)}
              </strong>
              <small>At or below reorder point</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-xs [&>span]:text-[#75827a] [&>span]:font-semibold [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-xs [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#ad5b4d]">
              <span>Out of stock</span>
              <strong>
                {loading ? "" : (summary?.summary.outOfStockCount ?? 0)}
              </strong>
              <small>Products with no available stock</small>
            </article>
          </section>

          <div className="flex justify-end mb-6">
            <Link
              href={user?.role === "STAFF" ? "/staff/inventory/settings" : "/admin/inventory/settings"}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:bg-brand-dark transition-colors animate-pulse"
            >
              Stock Settings
            </Link>
          </div>

          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden mb-3">
              <div className="grid gap-3 border-b border-[#edf1ed] px-5 py-4 max-[620px]:px-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="m-0 text-sm font-semibold text-ink">Stock by product</h2>
                    <p className="mb-0 mt-1 text-xs text-muted">{filteredStockRows.length} products in this view · showing {filteredStockRows.length ? (productPage - 1) * productPageSize + 1 : 0}–{Math.min(productPage * productPageSize, filteredStockRows.length)}</p>
                  </div>
                  <div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
                    <select
                      value={categoryFilter}
                      onChange={(event) => { setCategoryFilter(event.target.value); setProductPage(1); }}
                      aria-label="Filter products by category"
                      className="h-10 shrink-0 rounded-lg border border-line bg-white px-3 text-xs text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="">All categories</option>
                      {categories.map((category) => (
                        <option value={category} key={category}>{category}</option>
                      ))}
                    </select>
                    <select
                      value={stockStatusFilter}
                      onChange={(event) => { setStockStatusFilter(event.target.value); setProductPage(1); }}
                      aria-label="Filter products by stock status"
                      className="h-10 shrink-0 rounded-lg border border-line bg-white px-3 text-xs text-ink focus:border-brand focus:outline-none"
                    >
                      <option value="all">All stock levels</option>
                      <option value="in">In stock</option>
                      <option value="low">Low stock</option>
                      <option value="out">Out of stock</option>
                    </select>
                    <Link
                      className="flex shrink-0 items-center gap-1 px-2 text-xs text-brand hover:underline"
                      href={user?.role === "STAFF" ? "/staff/products" : "/admin/products"}
                    >
                      Manage products
                    </Link>
                  </div>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      type="search"
                      value={productSearch}
                      onChange={(event) => { setProductSearch(event.target.value); setProductPage(1); }}
                      placeholder="Search products"
                      aria-label="Search stock products"
                      className="h-10 w-full rounded-lg border border-line bg-white px-3 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                    />
                    {productSearch.trim().length > 0 && (
                      <div className="absolute right-3 top-2.5">
                        <FourDotLoader />
                      </div>
                    )}
                  </div>
                  {productSearch.trim().length > 0 && (
                    <button
                      type="button"
                      onClick={() => { setProductSearch(""); setProductPage(1); }}
                      className="h-10 w-10 flex items-center justify-center rounded-lg border border-line bg-white text-muted hover:text-ink"
                      aria-label="Cancel search"
                    >
                      <AdminUiIcon name="close" size={20} />
                    </button>
                  )}
                </div>
              </div>
              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-full min-w-[1220px] table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-[280px]" />
                    <col className="w-[120px]" />
                    <col className="w-[135px]" />
                    <col className="w-[85px]" />
                    <col className="w-[85px]" />
                    <col className="w-[110px]" />
                    <col className="w-[110px]" />
                    <col className="w-[130px]" />
                    <col className="w-[165px]" />
                  </colgroup>
                  <thead>
                    <tr className="h-10 border-b border-line bg-[#f8faf8] text-left text-[10px] font-medium uppercase tracking-wide text-muted">
                      <th className="px-3">Product</th>
                      <th className="px-3">Category</th>
                      <th className="px-3">Branch stock</th>
                      <th className="px-3 text-right">On hand</th>
                      <th className="px-3 text-right">Reserved</th>
                      <th className="px-3 text-right">Available</th>
                      <th className="px-3 text-right">Reorder at</th>
                      <th className="px-3">Stock status</th>
                      <th className="px-3">Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStockRows.map((row) => {
                      const product = products.find((p) => p.id === row.productId);
                      const availableUnits = Number(row.available);
                      const reorderLevel = Number(row.reorderLevel);
                      const isOut = availableUnits <= 0;
                      const isLow = !isOut && reorderLevel > 0 && availableUnits <= reorderLevel;
                      const expanded = expandedProducts.has(row.productId);
                      return (
                      <Fragment key={row.productId}>
                      <tr tabIndex={0} role="button" aria-expanded={expanded} aria-label={`${expanded ? "Hide" : "View"} details for ${row.name}`} onClick={() => setExpandedProducts((current) => { const next = new Set(current); if (next.has(row.productId)) next.delete(row.productId); else next.add(row.productId); return next; })} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setExpandedProducts((current) => { const next = new Set(current); if (next.has(row.productId)) next.delete(row.productId); else next.add(row.productId); return next; }); } }} className="h-[58px] cursor-pointer border-b border-[#edf1ed] text-xs text-[#536159] last:border-0 hover:bg-[#fbfdfb] focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
                        <td className="whitespace-nowrap px-3 py-2 align-middle">
                          <div className="flex min-w-0 items-center gap-2.5">
                            {row.imageUrl ? (
                              <img src={row.imageUrl} alt="" className="size-9 shrink-0 rounded-lg border border-line bg-[#f4f7f4] object-cover" />
                            ) : (
                              <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-xs font-semibold text-brand">
                                {row.name.trim().charAt(0).toUpperCase() || "P"}
                              </span>
                            )}
                            <span className="min-w-0 truncate" title={`${row.name} · ${row.sku} · ${product?.brand ?? "No brand"} · ${product?.model ?? "No model"} · per ${row.unit}`}>
                                <strong className="text-[13px] font-semibold leading-4 text-ink block truncate">{row.name}</strong>
                                <small className="text-[10px] text-muted flex gap-1">
                                  <span>{row.sku}</span>
                                  {product?.brand && <span>· {product.brand}</span>}
                                  {product?.model && <span>· {product.model}</span>}
                                </small>
                              </span>
                          </div>
                        </td>
                        <td className="truncate whitespace-nowrap px-3 py-2 align-middle text-[#65736a]" title={row.category || "Uncategorised"}>{row.category || "Uncategorised"}</td>
                        <td className="truncate whitespace-nowrap px-3 py-2 align-middle" title={row.branches.map((branch) => branch.name).join(", ")}>
                          {row.branches.length === 1 ? row.branches[0].name : (
                            <span className="font-medium text-brand">
                              {row.branches.length} branches
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-middle font-medium tabular-nums text-[#35453b]" title={`On hand: ${fmt(row.onHand)} ${row.unit}`}>{fmt(row.onHand)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums text-muted" title={`Reserved: ${fmt(row.reserved)} ${row.unit}`}>{fmt(row.reserved)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-middle font-semibold tabular-nums text-ink" title={`Available: ${fmt(row.available)} ${row.unit}`}>
                          {fmt(row.available)} <span className="text-[10px] font-normal text-muted">{row.unit}</span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right align-middle tabular-nums" title={`Reorder at: ${fmt(row.reorderLevel)} ${row.unit}`}>{fmt(row.reorderLevel)} <span className="text-[10px] text-muted">{row.unit}</span></td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle" title={isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}>
                          <span className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-semibold ${isOut ? "bg-[#fff0ed] text-[#ae6559]" : isLow ? "bg-[#fff6e8] text-[#a77b35]" : "bg-[#edf6ef] text-[#4d805a]"}`}>
                            {isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 align-middle text-[11px] text-muted" title={row.updatedAt ? date(row.updatedAt) : "No update recorded"}>{row.updatedAt ? date(row.updatedAt) : "-"}</td>
                      </tr>
                      {expanded && (
                        <tr key={`${row.productId}-details`} className="border-b border-[#edf1ed] bg-[#f8faf8] text-xs text-[#536159]">
                          <td colSpan={9} className="px-5 py-4">
                            <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                              <div><p className="m-0 text-sm font-semibold text-[#35453b]">{row.name}</p><p className="mb-0 mt-1 text-xs text-muted">SKU: {row.sku} <span className="px-1">·</span> {row.category || "Uncategorised"} <span className="px-1">·</span> Sold per {row.unit}</p></div>
                              <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${isOut ? "bg-[#fff0ed] text-[#ae6559]" : isLow ? "bg-[#fff6e8] text-[#a77b35]" : "bg-[#edf6ef] text-[#4d805a]"}`}>{isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}</span>
                            </div>
                            <div className="mb-3 flex flex-wrap gap-x-6 gap-y-2 text-xs"><span>On hand: <strong>{fmt(row.onHand)} {row.unit}</strong></span><span>Reserved: <strong>{fmt(row.reserved)} {row.unit}</strong></span><span>Available: <strong>{fmt(row.available)} {row.unit}</strong></span><span>Reorder at: <strong>{fmt(row.reorderLevel)} {row.unit}</strong></span></div>
                            <div className="grid gap-2 border-t border-[#e6ece7] pt-3">
                              {row.branches.map((branch) => <div key={branch.id ?? branch.name} className="grid grid-cols-[minmax(120px,1fr)_repeat(3,minmax(90px,auto))] gap-4 max-[620px]:grid-cols-2"><strong className="truncate font-medium" title={branch.name}>{branch.name}</strong><span className="text-right">On hand: {fmt(branch.onHand)} {row.unit}</span><span className="text-right">Reserved: {fmt(branch.reserved)} {row.unit}</span><span className="text-right">Available: {fmt(branch.available)} {row.unit}</span></div>)}
                            </div>
                          </td>
                        </tr>
                      )}
                      </Fragment>
                    ); })}
                  </tbody>
                </table>
              </div>
              {filteredStockRows.length > productPageSize && (
                <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-muted">
                  <span>Page {productPage} of {productPageCount}</span>
                  <div className="flex gap-2">
                    <button type="button" className="h-8 rounded-md border border-line bg-white px-3 disabled:cursor-not-allowed disabled:opacity-50" disabled={productPage <= 1} onClick={() => setProductPage((page) => Math.max(1, page - 1))}>Previous</button>
                    <button type="button" className="h-8 rounded-md border border-line bg-white px-3 disabled:cursor-not-allowed disabled:opacity-50" disabled={productPage >= productPageCount} onClick={() => setProductPage((page) => Math.min(productPageCount, page + 1))}>Next</button>
                  </div>
                </div>
              )}
              {!loading && !filteredStockRows.length && (
                <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55]">
                  {stockRows.length ? "No products match your search or category." : "No stock balances to show."}
                </div>
              )}
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-[#edf1ed] px-5 py-4 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:px-4">
              <div>
                <h2 className="m-0 text-sm font-semibold text-ink">
                  Recent stock movements
                </h2>
                <p className="mb-0 mt-1 text-xs text-muted">
                  A record of stock changes for this business.
                </p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr className="h-10 border-b border-[#e9eeea] bg-[#f8faf8] text-[10px] font-medium uppercase tracking-wide text-[#78857d]">
                    <th className="whitespace-nowrap px-5">Date</th>
                    <th className="px-4">Product</th>
                    <th className="px-4">Branch</th>
                    <th className="px-4">Change type</th>
                    <th className="px-4 text-right">Quantity</th>
                    <th className="px-4">Reference / note</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr
                      key={movement.id}
                      className="border-b border-[#edf1ed] text-xs text-[#536159] transition-colors last:border-0 hover:bg-[#fbfdfb]"
                    >
                      <td className="whitespace-nowrap px-5 py-4 text-muted">
                        {date(movement.createdAt)}
                      </td>
                      <td className="px-4 py-4">
                        <strong className="font-medium text-ink">
                          {movement.product.name}
                        </strong>
                        <small className="mt-1 block text-[10px] text-muted">
                          {movement.product.sku}
                        </small>
                      </td>
                      <td className="px-4 py-4">{movement.branch.name}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-md bg-[#f1f4f1] px-2.5 py-1 text-[10px] font-medium capitalize text-[#536159]">
                          {movement.type.replaceAll("_", " ").toLowerCase()}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <strong className={`font-semibold tabular-nums ${Number(movement.quantity) >= 0 ? "text-[#397853]" : "text-[#b86b59]"}`}>
                          {Number(movement.quantity) > 0 ? "+" : ""}
                          {fmt(movement.quantity)}
                        </strong>
                      </td>
                      <td className="max-w-[280px] truncate px-4 py-4 text-muted">
                        {movement.reference || movement.reason || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!movements.length && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No stock movements recorded.
              </p>
            )}
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Batch lots</h2>
                  <p>
                    {branchId
                      ? "FEFO stock batches for this branch."
                      : "Select a branch to inspect batch stock."}
                  </p>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full [border-collapse:collapse] [min-width:1050px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                  <thead>
                    <tr>
                      <th>PRODUCT / BATCH</th>
                      <th>EXPIRES</th>
                      <th>ON HAND</th>
                      <th>AVAILABLE</th>
                      <th>CONDITION</th>
                      <th>ORIGIN</th>
                      <th>MANAGE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.slice(0, 30).map((lot) => (
                      <tr key={lot.id}>
                        <td>
                          <strong>{lot.product.name}</strong>
                          <small className="block text-[#9aa49d] text-sm [margin-top:4px]">
                            {lot.batchNumber || "Unlabeled batch"}
                          </small>
                        </td>
                        <td>
                          {lot.expiresAt
                            ? date(lot.expiresAt)
                            : "No expiry date"}
                        </td>
                        <td>{fmt(lot.quantity)} {lot.product.unit}</td>
                        <td>{fmt(lot.available)}</td>
                        <td><span className={statusPill(lot.condition.toLowerCase())}>{lot.condition.toLowerCase()}</span></td>
                        <td>{lot.origin.toLowerCase().replaceAll("_", " ")}</td>
                        <td>
                          {canManage && <details className="relative">
                            <summary className="cursor-pointer text-brand">Change</summary>
                            <form onSubmit={(event) => void changeLotCondition(event, lot)} className="absolute right-0 z-10 mt-2 grid w-64 gap-2 rounded-lg border border-line bg-white p-3 shadow-lg">
                              <select name="condition" defaultValue={lot.condition} className="h-9 rounded-md border border-line bg-white px-2 text-sm">
                                <option value="GOOD">Good to sell</option>
                                <option value="DAMAGED">Damaged</option>
                                <option value="QUARANTINED">Keep aside</option>
                                <option value="EXPIRED">Expired</option>
                              </select>
                              <input name="reason" required minLength={3} maxLength={500} placeholder="Why are you changing it?" className="h-9 rounded-md border border-line px-2 text-sm" />
                              <button className="button-primary" disabled={busy === `lot-${lot.id}`}>{busy === `lot-${lot.id}` ? "Saving" : "Save condition"}</button>
                            </form>
                          </details>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {branchId && !lots.length && (
                <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                  No active lots in this branch.
                </p>
              )}
            </section>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Inventory control</span>
            <span>
              Count posting checks that stock has not changed since the count
              began.
            </span>
          </footer>
        </div>
        <AppSuccessModal message={notice} onClose={() => setNotice("")} title="Inventory Action Completed" />
        <AppErrorModal message={actionError} onClose={() => setActionError("")} title="Stock action could not be completed" />
      </main>
    </div>
  );
}


