"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { useInventoryOverview } from "@/hooks/queries/use-inventory-overview";
import { useBranchStore } from "@/stores/branch.store";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import {
  adjustProductStock,
  approveStockCount,
  createStockCount,
  createStockTransfer,
  dispatchStockTransfer,
  postStockCount,
  receiveStockTransferWithLines,
  changeStockLotCondition,
  submitStockCount,
} from "@/services/inventory/inventory.service";
import { useInventoryWorkflow } from "@/hooks/mutations/use-inventory-workflow";

type User = { id: string; name: string; email: string; role: string; branchId?: string | null };
type Branch = { id: string; name: string; isDefault: boolean };
type Product = { id: string; name: string; sku: string; unit?: string };
type Balance = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  unit: string;
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
const manageable = (role?: string) =>
  role === "OWNER" || role === "STAFF";
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
  const transfers = inventoryQuery.data?.transfers ?? [];
  const counts = inventoryQuery.data?.counts ?? [];
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
  const [countLineKeys, setCountLineKeys] = useState([0]);
  const [receivingTransferId, setReceivingTransferId] = useState("");

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

  async function createTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("create-transfer", () => createStockTransfer({
      sourceBranchId: form.get("source"),
      destinationBranchId: form.get("destination"),
      lines: [
        {
          productId: form.get("product"),
          quantity: Number(form.get("quantity")),
        },
      ],
    }));
  }
  async function createCount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productIds = form.getAll("product").map(String);
    const countedQuantities = form.getAll("countedQuantity").map(Number);
    await action("create-count", () => createStockCount({
      branchId: form.get("branch"),
      reason: form.get("reason"),
      lines: productIds.map((productId, index) => ({ productId, countedQuantity: countedQuantities[index] })),
    }));
  }
  async function receiveTransfer(event: React.FormEvent<HTMLFormElement>, transfer: Transfer) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = transfer.lines.map((line) => ({
      lineId: line.id,
      receivedQuantity: Number(form.get(`${line.id}-quantity`)),
      discrepancyReason: String(form.get(`${line.id}-reason`) ?? "").trim() || undefined,
    }));
    await action(transfer.id, () => receiveStockTransferWithLines(transfer.id, { lines }));
    setReceivingTransferId("");
  }
  async function changeLotCondition(event: React.FormEvent<HTMLFormElement>, lot: Lot) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action(`lot-${lot.id}`, () => changeStockLotCondition(lot.id, {
      condition: form.get("condition"),
      reason: form.get("reason"),
    }));
  }
  async function createAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productId = String(form.get("product"));
    await action(`adjust-${productId}`, () => adjustProductStock(productId, {
      branchId: form.get("branch"),
      quantity: Number(form.get("quantity")),
      reason: form.get("reason"),
    }));
  }

  if (!user)
    return <AdminPageSkeleton />;
  const canManage = manageable(user.role);
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
    const query = productSearch.trim().toLowerCase();
    const matchesSearch = !query || `${row.name} ${row.sku} ${row.category}`.toLowerCase().includes(query);
    const isOut = row.available <= 0;
    const isLow = !isOut && Number(row.reorderLevel) > 0 && row.available <= Number(row.reorderLevel);
    const matchesStatus = stockStatusFilter === "all" || (stockStatusFilter === "out" ? isOut : stockStatusFilter === "low" ? isLow : !isOut && !isLow);
    return matchesSearch && matchesStatus && (!categoryFilter || row.category === categoryFilter);
  });
  const availableByUnit = [...groupedStockRows.reduce((totals, row) => totals.set(row.unit, (totals.get(row.unit) ?? 0) + row.available), new Map<string, number>())];
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
          {notice && (
            <div
              className="mb-3 border border-[#dcebe0] bg-[#f1f8f3] rounded-lg py-2.5 px-3 text-[#4b7557] text-sm flex items-center justify-between gap-3 [&_button]:[border:0] [&_button]:bg-transparent [&_button]:text-inherit [&_button]:text-[15px]"
              role="status"
            >
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss"
              ></button>
            </div>
          )}
          {actionError && (
            <div
              className="m-0 text-[#b44f44] text-sm leading-normal"
              role="alert"
            >
              {actionError}
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
            <article className="bg-white border border-line rounded-xl p-4 grid content-start gap-1.5 min-h-[106px] max-[620px]:min-h-[91px] max-[620px]:p-3">
              <span className="text-xs font-semibold text-[#75827a]">Available units</span>
              <div className="grid gap-1 text-2xl font-semibold leading-none tracking-tight text-[#26372d]">
                {loading ? "Loading" : availableByUnit.length ? availableByUnit.map(([unit, quantity]) => <span key={unit}>{fmt(quantity)} <small className="text-xs font-medium tracking-normal">{unit}</small></span>) : <span>0</span>}
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
          <div className="grid [grid-template-columns:minmax(0,1.6fr)_minmax(270px,1fr)] gap-3 mb-3 items-start max-[950px]:grid-cols-1">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-[#edf1ed] px-5 py-4 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:px-4">
                <div>
                  <h2 className="m-0 text-sm font-semibold text-ink">Stock by product</h2>
                  <p className="mb-0 mt-1 text-xs text-muted">{filteredStockRows.length} products in this view · showing {filteredStockRows.length ? (productPage - 1) * productPageSize + 1 : 0}–{Math.min(productPage * productPageSize, filteredStockRows.length)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="search"
                    value={productSearch}
                    onChange={(event) => { setProductSearch(event.target.value); setProductPage(1); }}
                    placeholder="Search products"
                    aria-label="Search stock products"
                    className="h-10 w-48 rounded-lg border border-line bg-white px-3 text-xs text-ink placeholder:text-muted focus:border-brand focus:outline-none max-[620px]:w-full"
                  />
                  <select
                    value={categoryFilter}
                    onChange={(event) => { setCategoryFilter(event.target.value); setProductPage(1); }}
                    aria-label="Filter products by category"
                    className="h-10 rounded-lg border border-line bg-white px-3 text-xs text-ink focus:border-brand focus:outline-none"
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
                    className="h-10 rounded-lg border border-line bg-white px-3 text-xs text-ink focus:border-brand focus:outline-none"
                  >
                    <option value="all">All stock levels</option>
                    <option value="in">In stock</option>
                    <option value="low">Low stock</option>
                    <option value="out">Out of stock</option>
                  </select>
                  <Link
                    className="flex items-center gap-1 px-2 text-xs text-brand hover:underline"
                    href="/admin/products"
                  >
                    Manage products
                  </Link>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full min-w-[980px] border-collapse text-left">
                  <thead>
                    <tr className="h-10 border-b border-line bg-[#f8faf8] text-left text-[10px] font-medium uppercase tracking-wide text-muted">
                      <th className="px-4">Product</th>
                      <th className="px-4">Category</th>
                      <th className="px-4">Branch stock</th>
                      <th className="px-4 text-right">On hand</th>
                      <th className="px-4 text-right">Reserved</th>
                      <th className="px-4 text-right">Available</th>
                      <th className="px-4 text-right">Reorder at</th>
                      <th className="px-4">Stock status</th>
                      <th className="px-4">Last updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleStockRows.map((row) => {
                      const availableUnits = Number(row.available);
                      const reorderLevel = Number(row.reorderLevel);
                      const isOut = availableUnits <= 0;
                      const isLow = !isOut && reorderLevel > 0 && availableUnits <= reorderLevel;
                      const expanded = expandedProducts.has(row.productId);
                      return (
                      <Fragment key={row.productId}>
                      <tr className="border-b border-[#edf1ed] text-xs text-[#536159] last:border-0 hover:bg-[#fbfdfb]">
                        <td className="px-4 py-3">
                          <div className="flex min-w-[220px] items-center gap-3">
                            {row.imageUrl ? (
                              <img src={row.imageUrl} alt="" className="size-10 rounded-lg border border-line bg-[#f4f7f4] object-cover" />
                            ) : (
                              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-xs font-semibold text-brand">
                                {row.name.trim().charAt(0).toUpperCase() || "P"}
                              </span>
                            )}
                            <span className="grid min-w-0 gap-1">
                              <strong className="truncate text-xs font-medium text-ink">{row.name}</strong>
                              <small className="text-[10px] text-muted">{row.sku} · per {row.unit}</small>
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{row.category || "Uncategorised"}</td>
                        <td className="px-4 py-3">
                          {row.branches.length === 1 ? row.branches[0].name : (
                            <button type="button" className="cursor-pointer text-left text-brand hover:underline" onClick={() => setExpandedProducts((current) => { const next = new Set(current); if (next.has(row.productId)) next.delete(row.productId); else next.add(row.productId); return next; })} aria-expanded={expanded}>
                              {row.branches.length} branches
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(row.onHand)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(row.reserved)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums text-ink">
                          {fmt(row.available)} <span className="text-[10px] font-normal text-muted">{row.unit}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmt(row.reorderLevel)} <span className="text-[10px] text-muted">{row.unit}</span></td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-medium ${isOut ? "bg-[#fff0ed] text-[#ae6559]" : isLow ? "bg-[#fff6e8] text-[#a77b35]" : "bg-[#edf6ef] text-[#4d805a]"}`}>
                            {isOut ? "Out of stock" : isLow ? "Low stock" : "In stock"}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted">{row.updatedAt ? date(row.updatedAt) : "-"}</td>
                      </tr>
                      {expanded && row.branches.length > 1 && (
                        <tr key={`${row.productId}-branches`} className="border-b border-[#edf1ed] bg-[#f8faf8] text-xs text-[#536159]">
                          <td colSpan={9} className="px-6 py-3"><div className="grid gap-2">
                            {row.branches.map((branch) => <div key={branch.id ?? branch.name} className="grid grid-cols-[minmax(120px,1fr)_repeat(3,minmax(70px,auto))] gap-4"><strong className="font-medium">{branch.name}</strong><span className="text-right">On hand: {fmt(branch.onHand)} {row.unit}</span><span className="text-right">Reserved: {fmt(branch.reserved)} {row.unit}</span><span className="text-right">Available: {fmt(branch.available)} {row.unit}</span></div>)}
                          </div></td>
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
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-[15px] [&>.panel-heading]:[margin-bottom:10px] [&_select]:[font:inherit] [&_input]:[font:inherit]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Stock workflows</h2>
                  <p>You need owner or stock manager access to do this.</p>
                </div>
              </div>
              {canManage ? (
                <>
                  <form
                    className="grid gap-2 py-2.5 px-0 [border-top:1px_solid_#edf1ed] [&>strong]:text-sm [&>strong]:text-[#43544a] [&_input]:h-[33px] [&_input]:min-w-0 [&_input]:border border-[#e4eae5] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-[#536159] [&_input]:text-sm [&_select]:h-[33px] [&_select]:min-w-0 [&_select]:border border-[#e4eae5] [&_select]:rounded-[5px] [&_select]:py-0 px-2 [&_select]:bg-white [&_select]:text-[#536159] [&_select]:text-sm [&_.form-row]:gap-2 [&_.button-primary]:h-[33px] [&_.button-primary]:text-sm [&_.button-primary]:py-0 px-2 [&_.button-secondary]:h-[33px] [&_.button-secondary]:text-sm [&_.button-secondary]:py-0 px-2"
                    onSubmit={(event) => void createTransfer(event)}
                  >
                    <strong>New transfer</strong>
                    <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                      <select name="source" required aria-label="Source branch">
                        <option value="">From branch</option>
                        {branches.map((b) => (
                          <option value={b.id} key={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                      <select
                        name="destination"
                        required
                        aria-label="Destination branch"
                      >
                        <option value="">To branch</option>
                        {branches.map((b) => (
                          <option value={b.id} key={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <select name="product" required defaultValue="">
                      <option value="" disabled>
                        Select product
                      </option>
                      {products.map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name} {p.sku}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                      <input
                        name="quantity"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        placeholder="Quantity"
                      />
                      <button
                        className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                        disabled={busy === "create-transfer"}
                      >
                        {busy === "create-transfer"
                          ? "Creating"
                          : "Create transfer"}
                      </button>
                    </div>
                  </form>
                  <form
                    className="grid gap-2 py-2.5 px-0 [border-top:1px_solid_#edf1ed] [&>strong]:text-sm [&>strong]:text-[#43544a] [&_input]:h-[33px] [&_input]:min-w-0 [&_input]:border border-[#e4eae5] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-[#536159] [&_input]:text-sm [&_select]:h-[33px] [&_select]:min-w-0 [&_select]:border border-[#e4eae5] [&_select]:rounded-[5px] [&_select]:py-0 px-2 [&_select]:bg-white [&_select]:text-[#536159] [&_select]:text-sm [&_.form-row]:gap-2 [&_.button-primary]:h-[33px] [&_.button-primary]:text-sm [&_.button-primary]:py-0 px-2 [&_.button-secondary]:h-[33px] [&_.button-secondary]:text-sm [&_.button-secondary]:py-0 px-2"
                    onSubmit={(event) => void createCount(event)}
                  >
                    <strong>Start stock count</strong>
                    <select name="branch" required defaultValue={branchId}>
                      <option value="" disabled>
                        Select branch
                      </option>
                      {branches.map((b) => (
                        <option value={b.id} key={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <div className="grid gap-2">
                      {countLineKeys.map((key, index) => (
                        <div key={key} className="grid grid-cols-[minmax(0,1fr)_110px_auto] gap-2 max-[620px]:grid-cols-1">
                          <select name="product" required defaultValue="">
                            <option value="" disabled>Product {index + 1}</option>
                            {products.map((p) => <option value={p.id} key={p.id}>{p.name} {p.sku}</option>)}
                          </select>
                          <input name="countedQuantity" type="number" min="0" step="0.01" required placeholder="Physical count" aria-label={`Physical count for product ${index + 1}`} />
                          {countLineKeys.length > 1 && <button type="button" className="grid size-8 cursor-pointer place-items-center rounded-md border border-line bg-white text-muted hover:bg-canvas" aria-label={`Remove product ${index + 1} from count`} onClick={() => setCountLineKeys((keys) => keys.filter((item) => item !== key))}>×</button>}
                        </div>
                      ))}
                      <button type="button" className="w-fit cursor-pointer text-xs font-medium text-brand hover:underline" onClick={() => setCountLineKeys((keys) => [...keys, Math.max(...keys) + 1])}>+ Add another product</button>
                    </div>
                    <button
                      className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                      disabled={busy === "create-count"}
                    >
                      {busy === "create-count" ? "Saving" : "Create count"}
                    </button>
                    <input
                      name="reason"
                      placeholder="Count note (optional)"
                      maxLength={500}
                    />
                  </form>
                </>
              ) : (
                <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                  You can view stock, but only the owner or stock manager can
                  change it.
                </p>
              )}
            </section>
          </div>
          <div className="grid [grid-template-columns:minmax(0,1.6fr)_minmax(270px,1fr)] gap-3 mb-3 items-start max-[950px]:grid-cols-1">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Branch transfers</h2>
                  <p>Dispatch drafts and receive in-transit stock.</p>
                </div>
              </div>
              <div className="py-[3px] px-[15px]">
                {transfers.map((transfer) => (
                  <Fragment key={transfer.id}>
                  <article
                    className="min-h-[59px] flex items-center gap-2 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>div]:grid [&>div]:gap-1 [&>div]:min-w-0 [&>div]:[flex:1] [&>div_strong]:text-sm [&>div_strong]:text-[#3c4d42] [&>div_small]:text-sm [&>div_small]:text-[#909c94] [&>div_small]:leading-[1.4] [&>.button-primary]:h-[27px] [&>.button-primary]:py-0 px-2 [&>.button-primary]:text-sm [&>.button-primary]:whitespace-nowrap [&>.button-secondary]:h-[27px] [&>.button-secondary]:py-0 px-2 [&>.button-secondary]:text-sm [&>.button-secondary]:whitespace-nowrap max-[620px]:[flex-wrap:wrap] max-[620px]:py-2 px-0 max-[620px]:[&>div]:[flex-basis:100%] max-[620px]:[&>.catalogue-pill]:[margin-left:auto]"
                  >
                    <div>
                      <strong>{transfer.reference}</strong>
                      <small>
                        {transfer.sourceBranch.name}{" "}
                        {transfer.destinationBranch.name}{" "}
                        {transfer.lines
                          .map(
                            (line) =>
                              `${line.product.name}  ${fmt(line.quantity)}`,
                          )
                          .join(", ")}
                      </small>
                    </div>
                    <span className={statusPill(transfer.status.toLowerCase())}>
                      {transfer.status.toLowerCase().replaceAll("_", " ")}
                    </span>
                    {canManage && transfer.status === "DRAFT" && (
                      <button
                        className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                        disabled={busy === transfer.id}
                        onClick={() =>
                          void action(transfer.id, () => dispatchStockTransfer(transfer.id))
                        }
                      >
                        Dispatch
                      </button>
                    )}
                    {canManage && transfer.status === "IN_TRANSIT" && (
                      <button type="button"
                        className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                        onClick={() => setReceivingTransferId((current) => current === transfer.id ? "" : transfer.id)}>
                        {receivingTransferId === transfer.id ? "Close receipt" : "Record items received"}
                      </button>
                    )}
                  </article>
                  {canManage && transfer.status === "IN_TRANSIT" && receivingTransferId === transfer.id && (
                    <form className="grid gap-3 border-b border-line bg-canvas p-4" onSubmit={(event) => void receiveTransfer(event, transfer)}>
                      <strong className="text-sm font-semibold text-ink">Check each item received</strong>
                      {transfer.lines.map((line) => (
                        <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_140px_minmax(180px,1fr)] items-center gap-2 max-[700px]:grid-cols-1">
                          <label className="text-xs text-ink">{line.product.name} · sent {fmt(line.quantity)} {line.product.unit}</label>
                          <input name={`${line.id}-quantity`} type="number" min="0" step="0.001" required defaultValue={line.quantity} aria-label={`Quantity received for ${line.product.name}`} className="h-9 rounded-md border border-line bg-white px-2 text-sm" />
                          <input name={`${line.id}-reason`} maxLength={500} placeholder="Explain any difference" aria-label={`Reason for quantity difference for ${line.product.name}`} className="h-9 rounded-md border border-line bg-white px-2 text-sm" />
                        </div>
                      ))}
                      <button className="button-primary w-fit" disabled={busy === transfer.id}>{busy === transfer.id ? "Saving" : "Confirm received quantities"}</button>
                    </form>
                  )}
                  </Fragment>
                ))}
                {!transfers.length && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    No stock transfers yet.
                  </p>
                )}
              </div>
            </section>
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Stock counts</h2>
                  <p>
                    Send a stock check for approval, then save the approved
                    count.
                  </p>
                </div>
              </div>
              <div className="py-[3px] px-[15px]">
                {counts.map((count) => (
                  <article
                    className="min-h-[59px] flex items-center gap-2 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>div]:grid [&>div]:gap-1 [&>div]:min-w-0 [&>div]:[flex:1] [&>div_strong]:text-sm [&>div_strong]:text-[#3c4d42] [&>div_small]:text-sm [&>div_small]:text-[#909c94] [&>div_small]:leading-[1.4] [&>.button-primary]:h-[27px] [&>.button-primary]:py-0 px-2 [&>.button-primary]:text-sm [&>.button-primary]:whitespace-nowrap [&>.button-secondary]:h-[27px] [&>.button-secondary]:py-0 px-2 [&>.button-secondary]:text-sm [&>.button-secondary]:whitespace-nowrap max-[620px]:[flex-wrap:wrap] max-[620px]:py-2 px-0 max-[620px]:[&>div]:[flex-basis:100%] max-[620px]:[&>.catalogue-pill]:[margin-left:auto]"
                    key={count.id}
                  >
                    <div>
                      <strong>{count.reference}</strong>
                      <small>
                        {count.branch.name} · {count.lines.length} products · started by {count.createdBy.name} · {date(count.createdAt)}
                      </small>
                      <small>
                        {count.approvedBy ? `Approved by ${count.approvedBy.name}` : "Waiting for approval"}
                        {count.postedBy ? ` · Confirmed by ${count.postedBy.name}` : ""}
                      </small>
                    </div>
                    <details className="relative text-xs">
                      <summary className="cursor-pointer whitespace-nowrap text-brand">Review count</summary>
                      <div className="absolute right-0 z-10 mt-2 max-h-64 w-80 overflow-auto rounded-lg border border-line bg-white p-3 shadow-lg">
                        {count.lines.map((line) => (
                          <div key={line.product.sku} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line py-2 last:border-0">
                            <strong className="font-medium text-ink">{line.product.name}</strong>
                            <span className={Number(line.variance) === 0 ? "text-[#397853]" : "text-[#ad5b4d]"}>{Number(line.variance) > 0 ? "+" : ""}{fmt(line.variance)} {line.product.unit}</span>
                            <small className="col-span-2 text-muted">System {fmt(line.systemQuantity)} · Counted {fmt(line.countedQuantity)} {line.product.unit}</small>
                          </div>
                        ))}
                      </div>
                    </details>
                    <span className={statusPill(count.status.toLowerCase())}>
                      {count.status.toLowerCase()}
                    </span>
                    {canManage && count.status === "DRAFT" && (
                      <button
                        className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                        disabled={busy === count.id}
                        onClick={() =>
                          void action(count.id, () => submitStockCount(count.id))
                        }
                      >
                        Send for approval
                      </button>
                    )}
                    {(user.role === "OWNER" || user.role === "STAFF") && count.status === "SUBMITTED" && (
                      <button
                        className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                        disabled={busy === count.id}
                        onClick={() =>
                          void action(count.id, () => approveStockCount(count.id))
                        }
                      >
                        Approve
                      </button>
                    )}
                    {(user.role === "OWNER" || user.role === "STAFF") && count.status === "APPROVED" && (
                      <button
                        className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                        disabled={busy === count.id}
                        onClick={() =>
                          void action(count.id, () => postStockCount(count.id))
                        }
                      >
                        Confirm entry
                      </button>
                    )}
                  </article>
                ))}
                {!counts.length && <AdminEmptyState icon="box" title="No stock counts yet" description="Start a count when you are ready to compare shelf quantities with the system." />}
              </div>
            </section>
          </div>
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
          <div className="grid [grid-template-columns:minmax(0,1.6fr)_minmax(270px,1fr)] gap-3 mb-3 items-start max-[950px]:grid-cols-1 [margin-top:12px]">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-[15px] [&>.panel-heading]:[margin-bottom:10px] [&_select]:[font:inherit] [&_input]:[font:inherit]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Adjust stock</h2>
                  <p>Add or remove stock and say why.</p>
                </div>
              </div>
              {canManage ? (
                <form
                  className="grid gap-2 py-2.5 px-0 [border-top:1px_solid_#edf1ed] [&>strong]:text-sm [&>strong]:text-[#43544a] [&_input]:h-[33px] [&_input]:min-w-0 [&_input]:border border-[#e4eae5] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-[#536159] [&_input]:text-sm [&_select]:h-[33px] [&_select]:min-w-0 [&_select]:border border-[#e4eae5] [&_select]:rounded-[5px] [&_select]:py-0 px-2 [&_select]:bg-white [&_select]:text-[#536159] [&_select]:text-sm [&_.form-row]:gap-2 [&_.button-primary]:h-[33px] [&_.button-primary]:text-sm [&_.button-primary]:py-0 px-2 [&_.button-secondary]:h-[33px] [&_.button-secondary]:text-sm [&_.button-secondary]:py-0 px-2"
                  onSubmit={(event) => void createAdjustment(event)}
                >
                  <select name="branch" required defaultValue={branchId}>
                    <option value="" disabled>
                      Select branch
                    </option>
                    {branches.map((b) => (
                      <option value={b.id} key={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  <select name="product" required defaultValue="">
                    <option value="" disabled>
                      Select product
                    </option>
                    {products.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} {p.sku}
                      </option>
                    ))}
                  </select>
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    required
                    placeholder="Positive gain, negative loss"
                  />
                  <input
                    name="reason"
                    required
                    minLength={3}
                    maxLength={500}
                    placeholder="Reason for adjustment"
                  />
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                    disabled={!!busy}
                  >
                    Confirm entry stock adjustment
                  </button>
                </form>
              ) : (
                <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                  Stock adjustments are restricted to inventory managers and
                  owners.
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
          </div>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Inventory control</span>
            <span>
              Count posting checks that stock has not changed since the count
              began.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
