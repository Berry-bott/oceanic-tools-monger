"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePosCartStore } from "@/stores/pos-cart.store";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { useBranches } from "@/hooks/queries/use-branches";
import { useCustomers } from "@/hooks/queries/use-customers";
import { useProducts } from "@/hooks/queries/use-products";
import { useSalesWorkspace } from "@/hooks/queries/use-sales-workspace";
import { useBranchStore } from "@/stores/branch.store";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { AdminDialogPanel } from "@/components/admin-motion";
import { AppErrorModal } from "@/components/app-error-modal";
import { creditorKeys, createCreditor, getCreditors, type Creditor } from "@/services/customers/creditor.service";
import {
  closeCashShift,
  createPosSale,
  openCashShift,
  salesKeys,
} from "@/services/sales/sales.service";

type User = { id: string; name: string; email: string; role: string; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null };
type Branch = { id: string; name: string; isDefault: boolean };
type Product = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number | string;
  costPrice: number | string;
  unit: string;
  state: string;
  balances: {
    branchId: string;
    onHand: number | string;
    reserved: number | string;
  }[];
};
type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  creditLimit?: number | string | null;
};
type SaleLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
};
type Sale = {
  id: string;
  number: string;
  status: string;
  channel: string;
  total: number | string;
  createdAt: string;
  customer?: { id?: string; name: string } | null;
  user?: { name: string };
  lines: SaleLine[];
  dueAt?: string | null;
  payments?: { amount: number | string; payment: { status: string } }[];
  returns?: { total: number | string }[];
};
type Shift = {
  id: string;
  branchId: string;
  openingCash: number | string;
  openedAt: string;
  sales?: { total: number | string }[];
} | null;
const fmtMoney = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
const fmtDate = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const posRoles = (role?: string) => role === "OWNER" || role === "STAFF";
const canCreateCredit = (user?: User) => user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");
const paymentMethods = [
  { value: "CASH", label: "Cash", icon: "cash" },
  { value: "BANK_TRANSFER", label: "Transfer", icon: "transfer" },
  { value: "CARD", label: "Card", icon: "card" },
] as const;

export default function SalesPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const queryClient = useQueryClient();
  const branchesQuery = useBranches<Branch>();
  const customersQuery = useCustomers<Customer>();
  const creditorsQuery = useQuery({ queryKey: creditorKeys.all, queryFn: getCreditors, enabled: user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF"), staleTime: 30_000 });
  const productsQuery = useProducts("");
  const branches = branchesQuery.data?.data ?? [];
  const customers = customersQuery.data?.data ?? [];
  const branchId = useBranchStore((state) => state.selectedBranchId);
  const setBranchId = useBranchStore((state) => state.setSelectedBranchId);
  const salesQuery = useSalesWorkspace<Sale, NonNullable<Shift>>(
    branchId,
    posRoles(user?.role),
    Boolean(user && (branchId || branches.length === 0)),
  );
  const products = (productsQuery.data?.data ?? []).filter((product) => product.state === "ACTIVE") as Product[];
  const sales = salesQuery.data?.sales ?? [];
  const creditorAccounts = creditorsQuery.data?.data ?? [];
  const shift = salesQuery.data?.shift ?? null;
  const shiftSalesTotal = shift?.sales?.reduce((total, sale) => total + Number(sale.total), 0) ?? 0;
  const cart = usePosCartStore((state) => state.items);
  const addCartProduct = usePosCartStore((state) => state.addProduct);
  const setCartUnitPrice = usePosCartStore((state) => state.setUnitPrice);
  const adjustCartQuantity = usePosCartStore((state) => state.adjustQuantity);
  const clearCart = usePosCartStore((state) => state.clearCart);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "BANK_TRANSFER" | "CARD"
  >("CASH");
  const [checkoutExpanded, setCheckoutExpanded] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [selectedCreditorId, setSelectedCreditorId] = useState("");
  const [showNewCreditor, setShowNewCreditor] = useState(false);
  const [newCreditorType, setNewCreditorType] = useState<"PERSONAL" | "COMPANY">("COMPANY");
  const [payPartNow, setPayPartNow] = useState(false);
  const [partPaymentAmount, setPartPaymentAmount] = useState("");
  const [partPaymentMethod, setPartPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("CASH");
  const selectedCreditAccount = creditorAccounts.find((creditor) => creditor.id === selectedCreditorId);
  const loading = salesQuery.isLoading;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creditError, setCreditError] = useState("");
  const pageError = salesQuery.error instanceof Error
    ? salesQuery.error.message
    : customersQuery.error instanceof Error
      ? customersQuery.error.message
      : "";

  const loadOperational = useCallback(async () => {
    setError("");
    await salesQuery.refetch();
  }, [salesQuery.refetch]);

  useEffect(() => {
    if (branchId || !branches.length) return;
    setBranchId(
      branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? "",
    );
  }, [branchId, branches]);
  useEffect(() => {
    if (!checkoutExpanded) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCheckoutExpanded(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [checkoutExpanded]);
  const availableProducts = useMemo(
    () =>
      products.filter((product) => {
        const matches = `${product.name} ${product.sku} ${product.unit}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const balance = product.balances.find(
          (row) => row.branchId === branchId,
        );
        return (
          matches &&
          Number(balance?.onHand ?? 0) - Number(balance?.reserved ?? 0) > 0
        );
      }),
    [products, search, branchId],
  );
  const subtotal = cart.reduce(
    (sum, row) => sum + row.unitPrice * row.quantity,
    0,
  );
  const total = subtotal;
  const belowCostProduct = cart.find(
    (row) => row.unitPrice < Number(row.product.costPrice),
  );

  function addProduct(product: Product) {
    addCartProduct(product, branchId);
  }
  function adjust(productId: string, amount: number) {
    adjustCartQuantity(productId, amount);
  }
  async function shiftOpen(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await openCashShift({
        branchId: form.get("branchId"),
        openingCash: Number(form.get("openingCash")),
      });
      setNotice("Cash shift opened.");
      await invalidateAdminSummaries(queryClient);
      await loadOperational();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the shift.");
    } finally {
      setBusy(false);
    }
  }
  async function closeShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shift) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await closeCashShift<{ variance: number}>(
        shift.id,
        Number(form.get("closingCash")),
      );
      setNotice(Math.abs(result.variance) < 0.01
        ? `${user?.name ?? "Cashier"}'s shift is closed. Counted cash matched the expected amount.`
        : `${user?.name ?? "Cashier"}'s shift is closed. Counted cash was ${fmtMoney(Math.abs(result.variance))} ${result.variance < 0 ? "below" : "above"} the expected amount.`);
      await invalidateAdminSummaries(queryClient);
      await loadOperational();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close the shift.");
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    if (!cart.length || !branchId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payments = [{ method: paymentMethod, amount: total }];
      const result = await createPosSale<Sale>({
          branchId,
          customerId: customerId || undefined,
          cashShiftId: paymentMethod === "CASH" ? shift?.id : undefined,
          channel: "POS",
          lines: cart.map((row) => ({
            productId: row.product.id,
            quantity: row.quantity,
            unitPrice: row.unitPrice,
          })),
          payments,
        }, crypto.randomUUID());
      setNotice(`Sale ${result.data.number} recorded successfully.`);
      clearCart();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        invalidateAdminSummaries(queryClient),
      ]);
      await loadOperational();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  async function createCreditAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setCreditError("");
    try {
      const name = String(form.get(newCreditorType === "COMPANY" ? "companyName" : "name") ?? "").trim();
      const result = await createCreditor({
        type: newCreditorType,
        name,
        companyName: newCreditorType === "COMPANY" ? name : undefined,
        contactPerson: form.get("contactPerson") || undefined,
        phone: form.get("phone") || undefined,
        email: form.get("email") || undefined,
        creditLimit: Number(form.get("creditLimit")),
        creditDays: Number(form.get("creditDays")),
      });
      setSelectedCreditorId(result.data.id);
      setShowNewCreditor(false);
      await queryClient.invalidateQueries({ queryKey: creditorKeys.all });
    } catch (cause) {
      setCreditError(cause instanceof Error ? cause.message : "Could not save this creditor.");
    } finally {
      setBusy(false);
    }
  }
  async function checkoutCredit() {
    if (!cart.length || !branchId || !selectedCreditorId) {
      setCreditError("Select a creditor account before completing this sale.");
      return;
    }
    const paidNow = payPartNow ? Number(partPaymentAmount) : 0;
    if (payPartNow && (!Number.isFinite(paidNow) || paidNow <= 0 || paidNow >= total)) {
      setCreditError(`Enter a part payment greater than zero and less than ${fmtMoney(total)}.`);
      return;
    }
    if (payPartNow && partPaymentMethod === "CASH" && !shift) {
      setCreditError("Open a cashier shift before recording a cash part payment.");
      return;
    }
    if (belowCostProduct) {
      setCreditError(`${belowCostProduct.product.name} cannot be sold below its cost price of ${fmtMoney(Number(belowCostProduct.product.costPrice))}.`);
      return;
    }
    setBusy(true);
    setCreditError("");
    setError("");
    setNotice("");
    try {
      const result = await createPosSale<Sale>({
        branchId,
        customerId: selectedCreditorId,
        cashShiftId: payPartNow && partPaymentMethod === "CASH" ? shift?.id : undefined,
        channel: "POS",
        lines: cart.map((row) => ({ productId: row.product.id, quantity: row.quantity, unitPrice: row.unitPrice })),
        payments: payPartNow ? [{ method: partPaymentMethod, amount: paidNow }] : [],
      }, crypto.randomUUID());
      setCreditOpen(false);
      setNotice(`Credit sale ${result.data.number} recorded${paidNow ? ` with ${fmtMoney(paidNow)} paid` : ""}.`);
      clearCart();
      setSelectedCreditorId("");
      setPayPartNow(false);
      setPartPaymentAmount("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: creditorKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        invalidateAdminSummaries(queryClient),
      ]);
      await loadOperational();
    } catch (cause) {
      setCreditError(cause instanceof Error ? cause.message : "Could not complete this credit sale.");
    } finally {
      setBusy(false);
    }
  }
  if (!user)
    return <AdminPageSkeleton />;
  const canPos = posRoles(user.role);
  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <h1>Point of sale</h1>
              <p>Sell items and return goods from a recorded sale.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 max-[620px]:w-full">
              <Link href="/admin/sales/returns" className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-brand bg-brand px-4 text-sm text-white transition-colors hover:bg-brand-dark hover:border-brand-dark">
                Process a return
              </Link>
              <label className="flex items-center gap-2 text-sm text-[#77847b] max-[620px]:flex-1 max-[620px]:flex-col max-[620px]:items-stretch">
                <span className="sr-only">Branch</span>
                <select
                  value={branchId}
                  disabled={!!shift}
                  onChange={(event) => setBranchId(event.target.value)}
                  aria-label="Select branch"
                  className="h-[34px] max-w-[200px] rounded-md border border-[#e1e8e2] bg-white px-2 text-sm text-[#435249] max-[620px]:max-w-none"
                >
                  <option value="">Select branch</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          {pageError && (
            <div
              className="[&_strong]:text-[#a5554a] [&_p]:text-[#8e7974] m-0 text-[#b44f44] text-sm leading-normal"
              role="alert"
            >
              {pageError}
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
          {canPos && (
            <section className="flex justify-between items-center gap-[15px] py-[13px] px-4 mb-3 bg-white border border-line rounded-lg [&>div]:grid [&>div]:gap-1 [&>div_strong]:text-sm [&>div_strong]:text-[#385844] [&>div_small]:text-[11px] [&>div_small]:leading-5 [&>div_small]:text-[#89958d] [&_form]:flex [&_form]:items-end [&_form]:gap-2 [&_label]:grid [&_label]:gap-1 [&_label]:text-sm [&_input]:h-[32px] [&_input]:[min-width:130px] [&_input]:border border-[#e2e9e3] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-sm [&_button]:h-[32px] [&_button]:px-2.5 [&_button]:text-sm max-[620px]:items-stretch max-[620px]:flex-col max-[620px]:[&_form]:items-stretch max-[620px]:[&_form]:[flex-wrap:wrap] max-[620px]:[&_label]:[flex:1] max-[620px]:[&_input]:w-full">
              <div>
                <strong>
                  {shift ? "Your shift has started" : "You have not started a shift"}
                </strong>
                <small>
                  {shift
                    ? `${user?.name} (${user?.email}) | clocked in ${fmtDate(shift.openedAt)} | ${shift.sales?.length ?? 0} sales, ${fmtMoney(shiftSalesTotal)} | opening cash ${fmtMoney(Number(shift.openingCash))}`
                    : "Cash payments require an open cashier shift."}
                </small>
              </div>
              {!shift ? (
                <form onSubmit={(event) => void shiftOpen(event)}>
                  <input type="hidden" name="branchId" value={branchId} />
                  <label>
                    Opening cash
                    <input
                      name="openingCash"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                    disabled={busy || !branchId}
                  >
                    {busy ? "Opening" : "Open shift"}
                  </button>
                </form>
              ) : (
                <form onSubmit={(event) => void closeShift(event)}>
                  <label>
                    Counted cash
                    <input
                      name="closingCash"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="Enter cash count"
                    />
                  </label>
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] hover:bg-brand-dark disabled:opacity-65"
                    disabled={busy}
                  >
                    <AdminUiIcon name="check" size={15} />
                    {busy ? "Closing" : "Close shift"}
                  </button>
                </form>
              )}
            </section>
          )}
          <div className="grid [grid-template-columns:minmax(0,1.45fr)_minmax(360px,1fr)] gap-3 items-start mb-3 max-[950px]:grid-cols-1">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="grid gap-3 border-b border-[#edf1ed] px-[18px] py-[17px] max-[620px]:px-[13px]">
                <h2 className="m-0 text-sm">Choose items</h2>
                <label className="flex h-10 w-full items-center gap-2 rounded-lg border border-[#dfe6e0] bg-white px-3 text-[#849087] transition-[border-color,box-shadow] focus-within:border-[#73a48a] focus-within:shadow-[0_0_0_3px_#eaf3ec]">
                  <AdminUiIcon name="search" size={18} />
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-sm text-[#344139] outline-none placeholder:text-[#a3ada5] focus:border-0 focus:shadow-none focus:outline-none focus:ring-0"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search by product name, SKU or unit"
                    aria-label="Search products"
                  />
                  {search && <button type="button" className="grid size-7 cursor-pointer place-items-center rounded-md border-0 bg-transparent text-[#849087] transition-colors hover:bg-canvas hover:text-ink" onClick={() => setSearch("")} aria-label="Clear product search" title="Clear search"><AdminUiIcon name="close" size={15} /></button>}
                </label>
              </div>
              <div className="max-h-[530px] overflow-auto px-4 max-[620px]:px-3" aria-busy={productsQuery.isLoading}>
                {productsQuery.isLoading ? (
                  <div className="animate-pulse" role="status" aria-label="Loading products">
                    {Array.from({ length: 5 }, (_, index) => (
                      <div key={index} className="grid min-h-[68px] grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[#edf1ed] py-3">
                        <div className="grid gap-2">
                          <span className="h-3.5 w-2/3 rounded bg-[#e9eeea]" />
                          <span className="h-3 w-1/2 rounded bg-[#f0f3f0]" />
                        </div>
                        <div className="grid justify-items-end gap-2">
                          <span className="h-3.5 w-20 rounded bg-[#e9eeea]" />
                          <span className="h-3 w-16 rounded bg-[#f0f3f0]" />
                        </div>
                      </div>
                    ))}
                    <span className="sr-only">Loading products…</span>
                  </div>
                ) : availableProducts.map((product) => (
                  <button
                    type="button"
                    className="grid min-h-[68px] w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 border-0 border-b border-[#edf1ed] bg-white py-3 text-left text-[#35463b] hover:bg-[#f8faf8]"
                    key={product.id}
                    onClick={() => addProduct(product)}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-sm font-medium">{product.name}</strong>
                      <small className="mt-1 block text-xs text-[#8e9a91]">{product.sku} | Sold per {product.unit || "piece"}</small>
                    </span>
                    <span className="text-right">
                      <strong className="block text-sm font-extrabold text-[#28664e]">{fmtMoney(Number(product.sellingPrice))}</strong>
                      <small className="mt-1 block text-xs text-[#8e9a91]">Available: {(() => { const balance = product.balances.find((row) => row.branchId === branchId); return Number(balance?.onHand ?? 0) - Number(balance?.reserved ?? 0); })()}</small>
                    </span>
                  </button>
                ))}
                {!productsQuery.isLoading && !availableProducts.length && (
                  <AdminEmptyState icon="box" title="No items ready to sell" description="Active products with available stock will appear here." />
                )}
              </div>
            </section>
            {canPos ? (
              <>
              {checkoutExpanded && createPortal(
                <button
                  type="button"
                  className="fixed inset-0 z-[70] cursor-default border-0 bg-[#14201e66] backdrop-blur-[2px]"
                  aria-label="Close expanded checkout"
                  onClick={() => setCheckoutExpanded(false)}
                />,
                document.body,
              )}
              <section
                className={`min-w-0 rounded-xl border border-line bg-white p-3.5 shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 [&>.panel-heading]:mb-2 ${checkoutExpanded ? "fixed inset-x-3 top-3 bottom-6 z-[71] mx-auto flex max-h-[calc(100dvh-2.25rem)] w-[calc(100vw-1.5rem)] max-w-[680px] flex-col overflow-hidden !p-3 shadow-[0_24px_70px_#17251f42] max-[620px]:!p-2.5" : "sticky top-3 flex max-h-[calc(100dvh-6rem)] flex-col overflow-hidden max-[950px]:static max-[950px]:max-h-[calc(100dvh-8rem)]"}`}
                role={checkoutExpanded ? "dialog" : undefined}
                aria-modal={checkoutExpanded || undefined}
                aria-labelledby="sales-checkout-title"
                tabIndex={checkoutExpanded ? -1 : undefined}
              >
                <div className={`flex items-start justify-between gap-2 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-xs [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0 ${checkoutExpanded ? "mb-2" : "mb-3"}`}>
                  <div>
                    <h2 id="sales-checkout-title">{cart.length ? "Sales in progress" : "Sales checkout"}</h2>
                    <p>{cart.length} product line(s)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="grid size-9 cursor-pointer place-items-center rounded-lg border border-[#e4eae5] bg-white text-[#718078] transition-colors hover:border-[#bfd4c4] hover:bg-[#f5f8f5] hover:text-brand"
                      onClick={() => setCheckoutExpanded((expanded) => !expanded)}
                      aria-label={checkoutExpanded ? "Collapse checkout" : "Expand checkout"}
                      title={checkoutExpanded ? "Collapse checkout" : "Expand checkout"}
                    >
                      <AdminUiIcon name={checkoutExpanded ? "collapse" : "expand"} size={16} />
                    </button>
                    <button
                      type="button"
                      className="grid size-9 cursor-pointer place-items-center rounded-lg border border-[#e4eae5] bg-white text-[#8a625b] transition-colors hover:border-[#e8c9c2] hover:bg-[#fff5f2] hover:text-[#a5554a] disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={clearCart}
                      disabled={!cart.length || busy}
                      aria-label="Clear sale items"
                      title="Clear sale items"
                    >
                      <AdminUiIcon name="trash" size={16} />
                    </button>
                  </div>
                </div>
                <div className={`min-h-0 flex-1 overflow-y-auto overscroll-contain ${checkoutExpanded ? "pb-8" : ""}`}>
                <div className="grid gap-2 px-0.5 py-1">
                  {cart.map((row) => (
                    <article
                      className={`flex items-center gap-2 rounded-lg border border-[#e7ece8] bg-white transition-colors hover:border-[#cbdacf] [&>div:first-child]:grid [&>div:first-child]:gap-1 [&>div:first-child]:[flex:1] [&>div:first-child]:min-w-0 [&>div:first-child_strong]:text-sm [&>div:first-child_strong]:font-semibold [&>div:first-child_strong]:overflow-hidden [&>div:first-child_strong]:text-ellipsis [&>div:first-child_strong]:whitespace-nowrap [&>div:first-child_small]:text-xs [&>div:first-child_small]:text-[#929e96] [&>b]:text-sm [&>b]:font-bold [&>b]:whitespace-nowrap ${checkoutExpanded ? "p-2" : "p-3"}`}
                      key={row.product.id}
                    >
                      <div>
                        <strong>{row.product.name}</strong>
                        <small>Unit: {row.product.unit || "piece"} | Cost price: {fmtMoney(Number(row.product.costPrice))}</small>
                        <label className={`${checkoutExpanded ? "mt-1" : "mt-2"} grid max-w-36 gap-1 text-xs text-[#75827a]`}>
                          Selling price each
                          <input
                            aria-label={`Selling price for ${row.product.name}`}
                            type="number"
                            min={Number(row.product.costPrice)}
                            step="0.01"
                            value={row.unitPrice}
                            onChange={(event) => setCartUnitPrice(row.product.id, Number(event.target.value))}
                            className="h-8 w-full rounded-md border border-[#e2e9e3] px-2 text-sm text-[#344139]"
                          />
                        </label>
                      </div>
                      <div className="flex items-center gap-1 [&_button]:grid [&_button]:size-7 [&_button]:cursor-pointer [&_button]:place-items-center [&_button]:border [&_button]:border-[#e6ebe6] [&_button]:rounded-md [&_button]:bg-white [&_button]:text-[#52645a] [&_button]:transition-colors [&_button:hover]:bg-canvas [&_span]:text-sm [&_span]:[min-width:18px] [&_span]:text-center">
                        <button
                          type="button"
                          onClick={() => adjust(row.product.id, -1)}
                          aria-label={`Remove one ${row.product.name}`}
                        >
                          <AdminUiIcon name="minus" size={13} />
                        </button>
                        <span>{row.quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjust(row.product.id, 1)}
                          aria-label={`Add one ${row.product.name}`}
                        >
                          <AdminUiIcon name="plus" size={13} />
                        </button>
                      </div>
                      <b className="font-bold text-[#26372d]">
                        {fmtMoney(
                          row.unitPrice * row.quantity,
                        )}
                      </b>
                    </article>
                  ))}
                  {!cart.length && (
                    <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                      Select products to start a sale.
                    </p>
                  )}
                </div>
                <div className="[&_label]:grid [&_label]:gap-1 [&_label]:text-[#75827a] [&_label]:text-xs [&_input]:h-[32px] [&_input]:[min-width:130px] [&_input]:border border-[#e2e9e3] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-[#425148] [&_input]:text-sm [&_select]:h-[32px] [&_select]:[min-width:130px] [&_select]:border border-[#e2e9e3] [&_select]:rounded-[5px] [&_select]:py-0 px-2 [&_select]:bg-white [&_select]:text-[#425148] [&_select]:text-sm grid gap-2 py-2 px-0 [&_select]:w-full [&_select]:min-w-0 [&_input]:w-full [&_input]:min-w-0 [&_.form-row]:gap-2">
                  <label>
                    Customer
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    >
                      <option value="">Customer paying now</option>
                      {customers.map((customer) => (
                        <option value={customer.id} key={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className={`grid ${checkoutExpanded ? "gap-1" : "gap-1.5"} grid-cols-4`} role="group" aria-label="Payment method">
                  {paymentMethods.map((method) => {
                    const selected = paymentMethod === method.value;
                    return (
                      <button
                        key={method.value}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setPaymentMethod(method.value)}
                        className={`flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border ${checkoutExpanded ? "py-1.5" : "py-2.5"} text-[10px] font-semibold uppercase tracking-wide transition-colors ${selected ? "border-brand bg-[#edf7f3] text-brand" : "border-line bg-white text-[#87938b] hover:border-[#cbdacf] hover:bg-[#fafcfa]"}`}
                      >
                        <AdminUiIcon name={method.icon} size={17} />
                        <span className="truncate">{method.label}</span>
                      </button>
                    );
                  })}
                  {canPos && canCreateCredit(user) && (
                    <button
                      type="button"
                      title="Record this cart as a credit sale"
                      onClick={() => { setCreditOpen(true); setCreditError(""); setSelectedCreditorId(""); setShowNewCreditor(false); setPayPartNow(false); setPartPaymentAmount(""); }}
                      className={`flex min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border border-line bg-white text-[10px] font-semibold uppercase tracking-wide text-[#87938b] transition-colors hover:border-[#cbdacf] hover:bg-[#fafcfa] hover:text-brand ${checkoutExpanded ? "py-1.5" : "py-2.5"}`}
                    >
                      <AdminUiIcon name="clock" size={17} />
                      <span className="truncate">Credit</span>
                    </button>
                  )}
                </div>
                <div className={checkoutExpanded ? "mt-1 space-y-1 border-t border-line bg-white pt-2" : "sticky bottom-0 z-10 mt-2 shrink-0 space-y-2 border-t border-line bg-white pt-2"}>
                <div className="grid [grid-template-columns:1fr_auto] gap-1 py-1.5 px-0 text-[#75827a] text-sm [&_small]:[grid-column:1/-1] [&_small]:text-[#aa654f] [&_small]:text-sm">
                  <span>Subtotal</span>
                  <strong className="font-semibold">{fmtMoney(subtotal)}</strong>
                  <span className="font-semibold text-[#304138]">Amount due</span>
                  <strong className="text-lg font-extrabold tracking-tight text-[#26372d]">{fmtMoney(total)}</strong>
                </div>
                {belowCostProduct && (
                  <p className="mb-3 rounded-lg border border-[#f0d2c8] bg-[#fff7f4] p-3 text-sm text-[#9c4f40]" role="alert">
                    {belowCostProduct.product.name} cannot be sold below its cost price of {fmtMoney(Number(belowCostProduct.product.costPrice))}. Increase the item&apos;s selling price to continue.
                  </p>
                )}
                <button
                  type="button"
                  className="flex h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-lg border border-brand bg-brand px-4 text-sm font-semibold text-white shadow-sm transition-[background-color,box-shadow,transform] hover:-translate-y-px hover:bg-brand-dark hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                  disabled={
                    busy ||
                    !cart.length ||
                    Boolean(belowCostProduct) ||
                    !branchId ||
                    (paymentMethod === "CASH" && !shift)
                  }
                  onClick={() => void checkout()}
                >
                  <span className="inline-flex items-center gap-2">
                    {busy ? <span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <AdminUiIcon name="receipt" size={17} />}
                    {busy ? "Processing sale..." : "Complete sale"}
                  </span>
                  <span className="rounded-md bg-white/15 px-2.5 py-1 tabular-nums">{fmtMoney(total)}</span>
                </button>
                {paymentMethod === "CASH" && !shift && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    Open a cashier shift before taking cash payments.
                  </p>
                )}
                </div>
                </div>
              </section>
              </>
            ) : null}
          </div>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden mb-3">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Recent sales</h2>
                <p>Latest transactions for the selected branch.</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full min-w-[900px] border-collapse text-left [&_th]:h-10 [&_th]:bg-[#fafbfa] [&_th]:px-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-[#87938b] [&_th]:whitespace-nowrap [&_td]:border-t [&_td]:border-[#f0f3f0] [&_td]:px-4 [&_td]:py-3 [&_td]:text-sm [&_td]:text-[#5c6b61] [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-[#f8faf8]">
                <thead>
                  <tr>
                    <th>SALE</th>
                    <th>ITEMS</th>
                    <th>TOTAL</th>
                    <th className="min-w-[220px]">STATUS</th>
                    {canPos && <th className="w-[110px] text-right">ACTIONS</th>}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <div className="flex min-w-[220px] items-center gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-[#438060]">
                            <AdminUiIcon name="receipt" size={17} />
                          </span>
                          <span className="grid gap-1">
                            <strong className="font-medium text-[#35463b]">{sale.number}</strong>
                            <small className="text-xs text-[#929d95]">{sale.customer?.name || "Walk-in customer"} · {fmtDate(sale.createdAt)}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className="block max-w-[420px] overflow-hidden text-ellipsis text-[#435249]" title={sale.lines.map((line) => `${line.productName} × ${Number(line.quantity)}`).join(", ")}>
                          {sale.lines.slice(0, 2).map((line) => `${line.productName} × ${Number(line.quantity)}`).join(", ")}
                          {sale.lines.length > 2 ? ` +${sale.lines.length - 2} more` : ""}
                        </span>
                        <small className="mt-1 block text-xs text-[#929d95]">{sale.lines.length} {sale.lines.length === 1 ? "item" : "items"} · {sale.channel.toLowerCase()}</small>
                      </td>
                      <td>
                        <strong className="font-medium text-[#35463b]">{fmtMoney(Number(sale.total))}</strong>
                      </td>
                      <td>
                        <div className="grid justify-items-start gap-1">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${["CANCELLED", "REFUNDED", "VOIDED"].includes(sale.status) ? "bg-[#fff0ed] text-[#ae6559]" : "bg-[#edf6ef] text-[#4d805a]"}`}>
                            {!["CANCELLED", "REFUNDED", "VOIDED"].includes(sale.status) && <AdminUiIcon name="check" size={12} />}
                            {sale.status.toLowerCase().replaceAll("_", " ")}
                          </span>
                          <small className="text-xs text-[#929d95]">
                            {(() => { const paid = (sale.payments ?? []).filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0); const returned = (sale.returns ?? []).reduce((sum, entry) => sum + Number(entry.total), 0); const balance = Math.max(0, Number(sale.total) - paid - returned); return balance <= 0.005 ? "Paid" : paid > 0 ? `Part paid · ${fmtMoney(balance)} due` : `Unpaid · ${fmtMoney(balance)} due`; })()}
                          </small>
                        </div>
                      </td>
                      {canPos && (
                        <td className="text-right">
                          <Link
                            href={`/admin/sales/returns?reference=${encodeURIComponent(sale.number)}`}
                            className="inline-grid size-9 cursor-pointer place-items-center rounded-lg border border-line bg-white text-brand transition-colors hover:bg-canvas"
                            aria-label={`Return items from sale ${sale.number}`}
                            title="Return items"
                          >
                            <AdminUiIcon name="return" size={16} />
                          </Link>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!sales.length && !loading && (
              <div className="p-5">
                <AdminEmptyState icon="receipt" title="No sales yet" description="Completed sales for this branch will appear here." />
              </div>
            )}
          </section>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Sales</span>
            <span>Prices and stock are validated by the API at checkout.</span>
          </footer>
        </div>
      </main>
      {creditOpen && createPortal((
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setCreditOpen(false); }}>
          <AdminDialogPanel className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-[0_24px_70px_#17251f42] max-[620px]:p-4" role="dialog" aria-modal="true" aria-labelledby="credit-sale-title" onEscape={() => { if (!busy) setCreditOpen(false); }}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 id="credit-sale-title" className="m-0 text-lg font-semibold text-[#26372d]">Complete credit sale</h2><p className="mb-0 mt-1 text-sm text-muted">Your {cart.length} selected item line(s) will stay in the sale.</p></div>
              <button type="button" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => setCreditOpen(false)} aria-label="Close"><AdminUiIcon name="close" size={15} /></button>
            </div>
            <div className="mb-4 grid max-h-36 gap-2 overflow-y-auto rounded-xl border border-[#e5ebe6] bg-[#fafcfb] p-3">
              <strong className="text-xs font-semibold text-[#536159]">Items in this sale</strong>
              {cart.map((row) => <div key={row.product.id} className="flex items-center justify-between gap-3 text-xs"><span className="min-w-0 truncate text-[#68756d]">{row.product.name} × {row.quantity}</span><strong className="shrink-0 font-medium tabular-nums text-[#35453b]">{fmtMoney(row.unitPrice * row.quantity)}</strong></div>)}
            </div>
            {showNewCreditor ? (
              <form className="grid gap-4" onSubmit={(event) => void createCreditAccount(event)}>
                <div><strong className="text-sm font-semibold text-[#35453b]">Add a creditor account</strong><p className="mb-0 mt-1 text-xs text-muted">Create the account, then return here to submit this cart.</p></div>
                <div className="flex w-fit rounded-[10px] bg-[#f3f5f3] p-1" role="group" aria-label="Creditor type">
                  {(["COMPANY", "PERSONAL"] as const).map((type) => <button key={type} type="button" aria-pressed={newCreditorType === type} onClick={() => setNewCreditorType(type)} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium ${newCreditorType === type ? "bg-white text-brand shadow-sm" : "text-muted hover:text-[#26372d]"}`}><AdminUiIcon name={type === "COMPANY" ? "company" : "person"} size={15} />{type === "COMPANY" ? "Company" : "Person"}</button>)}
                </div>
                <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                  {newCreditorType === "COMPANY" ? <label className="grid gap-1.5 text-sm text-[#536159]">Company name<input name="companyName" className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" required maxLength={180} /></label> : <label className="grid gap-1.5 text-sm text-[#536159]">Full name<input name="name" className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" required maxLength={180} /></label>}
                  <label className="grid gap-1.5 text-sm text-[#536159]">Contact person<input name="contactPerson" className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" maxLength={180} /></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Phone<input name="phone" type="tel" className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" maxLength={40} /></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Email<input name="email" type="email" className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" /></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Credit limit<input name="creditLimit" type="number" min="0" step="0.01" defaultValue={Math.ceil(total)} className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" required /></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Payment due in (days)<input name="creditDays" type="number" min="1" max="365" defaultValue="30" className="h-10 rounded-[10px] border border-[#dfe6e0] px-3 text-sm" required /></label>
                </div>
                <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-[#dfe6e0] bg-white px-4 text-sm text-[#4e5e54]" onClick={() => { setShowNewCreditor(false); setCreditError(""); }}>Back</button><button className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-brand bg-brand px-4 text-sm font-medium text-white disabled:opacity-60" disabled={busy}>{busy ? "Saving..." : "Save account"}</button></div>
              </form>
            ) : (
              <div className="grid gap-4">
                <label className="grid gap-1.5 text-sm text-[#536159]">Choose a person or company
                  <select className="h-10 w-full rounded-[10px] border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a]" value={selectedCreditorId} onChange={(event) => { setSelectedCreditorId(event.target.value); setCreditError(""); }}>
                    <option value="">Select an existing creditor</option>
                    {creditorAccounts.map((creditor) => <option key={creditor.id} value={creditor.id}>{creditor.name} · {creditor.type === "COMPANY" ? "Company" : "Person"}</option>)}
                  </select>
                </label>
                {creditorsQuery.isLoading && <p className="m-0 text-sm text-muted">Loading creditor accounts…</p>}
                {creditorsQuery.isError && <p role="alert" className="m-0 text-sm text-[#a5554a]">Could not load accounts. <button type="button" className="underline" onClick={() => void creditorsQuery.refetch()}>Try again</button></p>}
                <button type="button" className="w-fit cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-brand hover:underline" onClick={() => { setNewCreditorType("COMPANY"); setShowNewCreditor(true); setCreditError(""); }}>+ Add a new person or company</button>
                {selectedCreditAccount && <p className="m-0 rounded-lg bg-[#f6f8f6] p-3 text-xs text-[#68756d]">Current balance: <strong>{fmtMoney(selectedCreditAccount.outstandingBalance)}</strong> · Credit available: <strong>{fmtMoney(Math.max(0, Number(selectedCreditAccount.creditLimit ?? 0) - selectedCreditAccount.outstandingBalance))}</strong> · Terms: {selectedCreditAccount.creditDays} days</p>}
                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#e5ebe6] bg-[#fafcfb] p-3 text-sm text-[#35453b]"><input type="checkbox" checked={payPartNow} onChange={(event) => { setPayPartNow(event.target.checked); setCreditError(""); }} className="mt-0.5 accent-[#34765a]" /><span><strong className="font-medium">Collect a part payment now</strong><small className="mt-0.5 block text-xs text-muted">Optional. The unpaid remainder stays on the creditor account.</small></span></label>
                {payPartNow && <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#e5ebe6] p-3 max-[620px]:grid-cols-1">
                  <label className="grid gap-1.5 text-sm text-[#536159]">Amount received<input type="number" min="0.01" max={Math.max(0, total - 0.01)} step="0.01" value={partPaymentAmount} onChange={(event) => setPartPaymentAmount(event.target.value)} className="h-10 w-full rounded-[10px] border border-[#dfe6e0] px-3 text-sm" required /></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Payment method<select value={partPaymentMethod} onChange={(event) => setPartPaymentMethod(event.target.value as typeof partPaymentMethod)} className="h-10 w-full rounded-[10px] border border-[#dfe6e0] bg-white px-3 text-sm"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option></select></label>
                  {partPaymentMethod === "CASH" && !shift && <p className="col-span-2 m-0 text-xs text-[#a5554a] max-[620px]:col-span-1">Open a cashier shift before recording a cash part payment.</p>}
                </div>}
                <div className="flex items-center justify-between gap-3 border-t border-line pt-4 max-[500px]:items-stretch max-[500px]:flex-col"><span className="text-sm text-muted">Sale total <strong className="text-[#26372d]">{fmtMoney(total)}</strong></span><div className="flex justify-end gap-2"><button type="button" className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-[#dfe6e0] bg-white px-4 text-sm text-[#4e5e54]" onClick={() => setCreditOpen(false)}>Cancel</button><button type="button" className="inline-flex h-10 cursor-pointer items-center justify-center rounded-[10px] border border-brand bg-brand px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={busy || !cart.length || !selectedCreditorId || (payPartNow && !partPaymentAmount) || (payPartNow && partPaymentMethod === "CASH" && !shift)} onClick={() => void checkoutCredit()}>{busy ? "Recording..." : "Complete credit sale"}</button></div></div>
              </div>
            )}
          </AdminDialogPanel>
        </div>
      ), document.body)}
      <AppErrorModal message={creditError || error} onClose={() => { setCreditError(""); setError(""); }} title={creditError ? "Credit sale could not be completed" : "Sale could not be completed"} />
    </div>
  );
}
