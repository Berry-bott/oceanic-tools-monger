"use client";

import { Fragment, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBranches } from "@/hooks/queries/use-branches";
import { useCustomers } from "@/hooks/queries/use-customers";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useProducts } from "@/hooks/queries/use-products";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { AdminDialogPanel } from "@/components/admin-motion";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import {
  cancelInstallmentAgreement,
  createInstallmentAgreement,
  extendInstallmentDeadline,
  getInstallmentAgreements,
  installmentKeys,
  recordInstallmentPayment,
} from "@/services/sales/installment.service";

type Branch = { id: string; name: string; isDefault: boolean };
type Customer = { id: string; name: string; phone?: string | null; email?: string | null; isActive: boolean; emailRemindersAllowed: boolean; smsRemindersAllowed: boolean };
type InstallmentPayment = { id: string; amount: string | number; refundedAmount: string | number; payment: { id: string; method: string; reference: string; paidAt: string | null } };
type Installment = { id: string; sequence: number; amount: string | number; paidAmount: string | number; dueAt: string; status: string; payments: InstallmentPayment[] };
type Agreement = {
  id: string; number: string; status: string; total: string | number; paidTotal: string | number; installmentCount: number; createdAt: string;
  customer: { id: string; name: string; phone?: string | null; email?: string | null };
  branch: { id: string; name: string };
  lines: { id: string; productName: string; sku: string; quantity: string | number; unitPrice: string | number; lineTotal: string | number }[];
  installments: Installment[];
  payments: InstallmentPayment[];
  refunds: { id: string; amount: string | number; method: string; reason: string; createdAt: string }[];
};
type LineDraft = { productId: string; quantity: string; unitPrice: string };
type Action = { kind: "pay" | "extend"; agreement: Agreement; installment: Installment } | { kind: "cancel"; agreement: Agreement } | null;
type AgreementFilter = "ALL" | "ACTIVE" | "OVERDUE" | "COMPLETED" | "CANCELLED";

const number = (value: string | number) => Number(value);
const money = (value: number) => new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 2 }).format(value || 0);
const displayDate = (value: string) => new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value));
const inputClass = "h-10 w-full rounded-[10px] border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a] outline-none focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec]";
const labelClass = "grid gap-1.5 text-sm text-[#536159]";
const primaryButton = "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60";
const secondaryButton = "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#e0e7e1] bg-white px-4 text-sm text-[#4e5e54] hover:bg-[#f8faf8] disabled:opacity-50";

export default function InstallmentsPage() {
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user;
  const branchesQuery = useBranches<Branch>(Boolean(user));
  const customersQuery = useCustomers<Customer>("");
  const productsQuery = useProducts("");
  const agreementsQuery = useQuery({ queryKey: installmentKeys.all, queryFn: () => getInstallmentAgreements<Agreement>(), enabled: Boolean(user), staleTime: 30_000 });
  const branches = branchesQuery.data?.data ?? [];
  const customers = (customersQuery.data?.data ?? []).filter((customer) => customer.isActive);
  const products = (productsQuery.data?.data ?? []).filter((product) => product.state === "ACTIVE");
  const agreements = agreementsQuery.data?.data ?? [];
  const [lines, setLines] = useState<LineDraft[]>([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [action, setAction] = useState<Action>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [agreementFilter, setAgreementFilter] = useState<AgreementFilter>("ALL");
  const [createAgreementOpen, setCreateAgreementOpen] = useState(false);
  const [agreementSearch, setAgreementSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const activeAgreements = agreements.filter((agreement) => agreement.status === "ACTIVE");
  const outstanding = activeAgreements.reduce((sum, agreement) => sum + Math.max(0, number(agreement.total) - number(agreement.paidTotal)), 0);
  const overdueCount = activeAgreements.reduce((sum, agreement) => sum + agreement.installments.filter((installment) => installment.status === "OVERDUE").length, 0);
  const visibleAgreements = agreements.filter((agreement) => {
    const isOverdue = agreement.status === "ACTIVE" && agreement.installments.some((installment) => installment.status === "OVERDUE" || (number(installment.amount) > number(installment.paidAmount) && new Date(installment.dueAt).getTime() < Date.now()));
    const matchesStatus = agreementFilter === "ALL" ||
      (agreementFilter === "OVERDUE" ? isOverdue : agreement.status === agreementFilter);
    const search = agreementSearch.trim().toLowerCase();
    const matchesSearch = !search || [
      agreement.number,
      agreement.customer.name,
      agreement.customer.phone ?? "",
      agreement.customer.email ?? "",
      ...agreement.lines.flatMap((line) => [line.productName, line.sku]),
    ].some((value) => value.toLowerCase().includes(search));
    const matchesBranch = !branchFilter || agreement.branch.id === branchFilter;
    const matchesDueDate = (!dueFrom && !dueTo) || agreement.installments.some((installment) => {
      if (number(installment.paidAmount) >= number(installment.amount) || installment.status === "CANCELLED") return false;
      const dueDate = installment.dueAt.slice(0, 10);
      return (!dueFrom || dueDate >= dueFrom) && (!dueTo || dueDate <= dueTo);
    });
    return matchesStatus && matchesSearch && matchesBranch && matchesDueDate;
  });
  const selectedProducts = useMemo(() => new Set(lines.map((line) => line.productId).filter(Boolean)), [lines]);

  function closeCreateAgreement() {
    if (busy) return;
    setCreateAgreementOpen(false);
    setCustomerId("");
    setLines([{ productId: "", quantity: "1", unitPrice: "" }]);
    setError("");
  }

  async function refresh() {
    await Promise.all([agreementsQuery.refetch(), invalidateAdminSummaries(queryClient)]);
  }

  async function submitAgreement(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!customers.length || !branches.length || !products.length) {
      setError("To create an installment plan, you need an active customer, a branch, and at least one active product. Add or activate the missing records, then try again.");
      return;
    }
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    const orderLines = lines.filter((line) => line.productId).map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }));
    if (!orderLines.length || orderLines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      setError("Add an item and enter a valid quantity and agreed price.");
      setBusy(false);
      return;
    }
    try {
      await createInstallmentAgreement({ customerId: form.get("customerId"), branchId: form.get("branchId"), count: Number(form.get("count")), frequency: form.get("frequency"), firstDueAt: form.get("firstDueAt"), lines: orderLines });
      setNotice("Instalment agreement created. The items are reserved until the agreement is paid or cancelled.");
      setLines([{ productId: "", quantity: "1", unitPrice: "" }]);
      setCustomerId("");
      formElement.reset();
      setCreateAgreementOpen(false);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create the instalment agreement.");
    } finally {
      setBusy(false);
    }
  }

  async function submitAction(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      if (action.kind === "pay") {
        const result = await recordInstallmentPayment(action.agreement.id, action.installment.id, { amount: form.get("amount"), method: form.get("method"), reference: form.get("reference") }) as { data?: { completed?: boolean; saleNumber?: string } };
        setNotice(result.data?.completed ? `Final payment recorded. Sale ${result.data.saleNumber} has now been created.` : "Payment recorded against the agreed instalment.");
      } else if (action.kind === "extend") {
        await extendInstallmentDeadline(action.agreement.id, action.installment.id, { dueAt: form.get("dueAt"), reason: form.get("reason") });
        setNotice("Payment deadline extended and recorded.");
      } else {
        await cancelInstallmentAgreement(action.agreement.id, { method: form.get("method"), reference: form.get("reference"), reason: form.get("reason") });
        setNotice("Agreement cancelled, reserved stock released and any instalment money refunded as recorded.");
      }
      setAction(null);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The instalment action could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  if (userQuery.isLoading || !user) return <AdminPageSkeleton />;

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="mb-2 text-xs font-medium tracking-wide text-[#718b79]">SALES</p><h1 className="m-0 text-2xl font-semibold tracking-tight text-[#1a2a22]">Installments</h1><p className="mb-0 mt-1 text-sm text-[#75827a]">Make a payment plan for a customer and follow each payment until the balance is cleared.</p></div>
        <button type="button" className={primaryButton} onClick={() => { setError(""); setCreateAgreementOpen(true); }}>
          <AdminUiIcon name="plus" size={15} /> Create installment plan
        </button>
      </header>

      {notice && <div role="status" className="mb-4 flex items-center justify-between gap-3 rounded-[14px] border border-[#dcebe0] bg-[#f1f8f3] px-4 py-3 text-sm text-[#4b7557]">{notice}<button type="button" aria-label="Dismiss" className="grid size-8 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-inherit hover:bg-white/60" onClick={() => setNotice("")}><AdminUiIcon name="close" size={15} /></button></div>}
      {error && !action && !createAgreementOpen && <div role="alert" className="mb-4 rounded-[14px] border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a5554a]">{error}</div>}
      {agreementsQuery.isError && <div role="alert" className="mb-4 rounded-[14px] border border-[#f0d7d2] bg-[#fff5f2] p-4 text-sm text-[#a5554a]">Could not load installment agreements. <button className="ml-2 cursor-pointer underline" onClick={() => void refresh()}>Try again</button></div>}

      <section className="mb-5 grid grid-cols-3 gap-4 max-[620px]:grid-cols-1">
        <article className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-[#75827a]">Active agreements</span><span className="grid size-8 place-items-center rounded-lg bg-[#edf5ef] text-brand"><AdminUiIcon name="person" /></span></div><strong className="mt-1.5 block text-2xl font-semibold tabular-nums text-[#26372d]">{activeAgreements.length}</strong><small className="mt-0.5 block text-xs text-[#929d95]">Items held for customers</small></article>
        <article className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-[#75827a]">Payments left</span><span className="grid size-8 place-items-center rounded-lg bg-[#eaf4f2] text-brand"><AdminUiIcon name="money" /></span></div><strong className="mt-1.5 block text-2xl font-semibold tabular-nums text-[#26372d]">{money(outstanding)}</strong><small className="mt-0.5 block text-xs text-[#929d95]">Across active agreements</small></article>
        <article className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wide text-[#75827a]">Late installments</span><span className="grid size-8 place-items-center rounded-lg bg-[#fff3e7] text-[#a6782c]"><AdminUiIcon name="clock" /></span></div><strong className="mt-1.5 block text-2xl font-semibold tabular-nums text-[#a6782c]">{overdueCount}</strong><small className="mt-0.5 block text-xs text-[#929d95]">Past their agreed deadline</small></article>
      </section>

      {createAgreementOpen && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#14201e]/60 p-4 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCreateAgreement(); }}>
        <AdminDialogPanel role="dialog" aria-modal="true" aria-labelledby="create-agreement-title" onEscape={closeCreateAgreement} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#e4eae5] bg-white shadow-[0_24px_70px_rgba(12,25,25,.28)] sm:max-h-[calc(100dvh-3rem)]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#edf1ed] bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="money" size={19} /></span>
            <div><p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#718b79]">New payment plan</p><h2 id="create-agreement-title" className="m-0 text-xl font-semibold tracking-tight text-[#1a2a22]">Start an agreement</h2><p className="mb-0 mt-1 text-sm text-[#75827a]">Choose the customer, items, payment schedule and agreed first due date.</p></div>
          </div>
          <button type="button" aria-label="Close dialog" disabled={busy} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-[#e0e7e1] bg-white text-[#75827a] hover:bg-[#f8faf8] disabled:cursor-wait disabled:opacity-50" onClick={closeCreateAgreement}><AdminUiIcon name="close" size={15} /></button>
        </div>
        <div className="grid gap-5 p-5 sm:p-7">
        {(customersQuery.isLoading || branchesQuery.isLoading || productsQuery.isLoading) && <p role="status" aria-busy="true" className="m-0 animate-pulse rounded-lg border border-[#e5ebe6] bg-[#f7f9f7] p-3 text-sm text-[#536159]">Loading customers, branches and products...</p>}
        {(customersQuery.isError || branchesQuery.isError || productsQuery.isError) && <div role="alert" className="rounded-lg border border-[#f0d7d2] bg-[#fff5f2] p-3 text-sm text-[#a5554a]">Some setup data could not be loaded. Close and reopen the form after checking your connection, or refresh the page.</div>}
        {!customersQuery.isLoading && !branchesQuery.isLoading && !productsQuery.isLoading && (!customers.length || !branches.length || !products.length) && <div role="status" className="rounded-lg border border-[#f0e2c7] bg-[#fff9ed] p-3 text-sm text-[#856b3d]">
          You need at least one active customer, one branch and one active product to create a plan.
          {!customers.length && <span className="mt-1 block">Add or activate a customer.</span>}
          {!branches.length && <span className="mt-1 block">Set up a branch.</span>}
          {!products.length && <span className="mt-1 block">Add or activate a product.</span>}
        </div>}
        <form onSubmit={(event) => void submitAgreement(event)} className="grid gap-5">
          <section className="grid gap-4 rounded-xl border border-[#e7ece8] bg-[#fbfcfb] p-4 sm:p-5">
            <div><h3 className="m-0 text-sm font-semibold text-[#35453b]">Customer and schedule</h3><p className="mb-0 mt-1 text-xs text-[#829087]">Set who the plan is for and when payments are due.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={labelClass}>Customer<select className={inputClass} required={customers.length > 0} name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)}><option value="" disabled>Select customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` - ${customer.phone}` : ""}</option>)}</select></label>
            <label className={labelClass}>Branch<select className={inputClass} required={branches.length > 0} name="branchId" defaultValue={user.role === "STAFF" ? user.branchId ?? "" : branches.find((branch) => branch.isDefault)?.id ?? ""} disabled={user.role === "STAFF"}><option value="" disabled>Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>{user.role === "STAFF" && <input type="hidden" name="branchId" value={user.branchId ?? ""} />}</label>
            <label className={labelClass}>Number of payments<select className={inputClass} name="count" defaultValue="3">{Array.from({ length: 23 }, (_, index) => index + 2).map((count) => <option key={count} value={count}>{count} payments</option>)}</select></label>
            <label className={labelClass}>Payment frequency<select className={inputClass} name="frequency" defaultValue="MONTHLY"><option value="WEEKLY">Weekly</option><option value="MONTHLY">Monthly</option></select></label>
            <label className={`${labelClass} sm:col-span-2`}>First payment due<input className={inputClass} type="date" name="firstDueAt" required min={new Date().toISOString().slice(0, 10)} defaultValue={new Date(new Date().getTime() + 30 * 86_400_000).toISOString().slice(0, 10)} /></label>
          </div>
          {selectedCustomer && <aside className="flex items-start gap-3 rounded-[14px] border border-[#dfe9e1] bg-[#f5f8f5] p-4">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-brand"><AdminUiIcon name="person" /></span>
            <div className="min-w-0"><strong className="block text-sm font-semibold text-[#26372d]">{selectedCustomer.name}</strong><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#75827a]"><span>{selectedCustomer.phone || "No phone number"}</span><span>{selectedCustomer.email || "No email address"}</span></div></div>
          </aside>}
          </section>
          <section className="grid gap-4 rounded-xl border border-[#e7ece8] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="m-0 text-sm font-semibold text-[#35453b]">Items and agreed prices</h3><p className="mb-0 mt-1 text-xs text-[#829087]">Choose one item, or add more items to this payment plan.</p></div><button type="button" className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[10px] border border-[#dfe6e0] bg-white px-3 text-sm font-medium text-brand hover:bg-[#f8faf8]" onClick={() => setLines((current) => [...current, { productId: "", quantity: "1", unitPrice: "" }])}><AdminUiIcon name="plus" size={15} /> Add another item</button></div>
            {lines.map((line, index) => <div key={index} className="grid grid-cols-1 items-end gap-3 rounded-lg border border-[#edf1ed] bg-[#fbfcfb] p-3 sm:grid-cols-[minmax(0,1fr)_110px_160px_36px]">
              <label className={labelClass}>Product<select required={products.length > 0} className={inputClass} value={line.productId} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, productId: event.target.value, unitPrice: String(products.find((product) => product.id === event.target.value)?.sellingPrice ?? "") } : item))}><option value="">Select item</option>{products.map((product) => <option key={product.id} value={product.id} disabled={selectedProducts.has(product.id) && product.id !== line.productId}>{product.name} - {product.sku}</option>)}</select></label>
              <label className={labelClass}>Quantity<input className={inputClass} required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} /></label>
              <label className={labelClass}>Agreed price each<input className={inputClass} required type="number" min="0.01" step="0.01" value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, unitPrice: event.target.value } : item))} /></label>
              <button type="button" aria-label="Remove item" title="Remove item" disabled={lines.length === 1} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-[#e0e7e1] bg-white text-[#8e5c52] transition-colors hover:bg-[#fff5f2] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><AdminUiIcon name="trash" size={15} /></button>
            </div>)}
          </section>
          <p className="m-0 rounded-lg bg-[#f5f8f5] p-3 text-xs leading-relaxed text-[#65746a]">The agreed prices are fixed for this plan. Stock is reserved now, but the sale and sales revenue are recorded only after all payments are complete. Payments received before then are held as customer instalments.</p>
          {error && <p role="alert" className="m-0 text-sm text-[#b44f4a]">{error}</p>}
          <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-[#edf1ed] bg-white/95 px-5 py-4 backdrop-blur sm:-mx-7 sm:-mb-7 sm:px-7"><button type="button" className={secondaryButton} disabled={busy} onClick={closeCreateAgreement}>Cancel</button><button className={primaryButton} disabled={busy}>{busy ? "Saving agreement..." : "Create payment plan"}</button></div>
        </form>
        </div>
        </AdminDialogPanel>
      </div>, document.body)}

      <section className="overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_1px_2px_rgba(23,39,32,.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf1ed] p-4"><div><h2 className="m-0 text-base font-semibold text-[#26372d]">Customer agreements</h2><p className="mb-0 mt-1 text-sm text-[#75827a]">Record payments, extend a deadline or cancel and refund an unpaid plan.</p></div><div className="flex flex-wrap gap-1 rounded-[10px] bg-[#f3f5f3] p-1" role="group" aria-label="Filter payment plans">{(["ALL", "ACTIVE", "OVERDUE", "COMPLETED", "CANCELLED"] as AgreementFilter[]).map((filter) => <button key={filter} type="button" aria-pressed={agreementFilter === filter} onClick={() => setAgreementFilter(filter)} className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition-colors ${agreementFilter === filter ? "bg-white text-brand shadow-sm" : "text-[#75827a] hover:text-[#26372d]"}`}>{filter === "ALL" ? "All" : filter === "OVERDUE" ? "Overdue" : filter[0] + filter.slice(1).toLowerCase()}</button>)}</div></div>
        <div className="grid gap-3 border-b border-[#edf1ed] p-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className={labelClass}>Search agreements<input className={inputClass} type="search" value={agreementSearch} onChange={(event) => setAgreementSearch(event.target.value)} placeholder="Number, customer, phone or item" /></label>
          <label className={labelClass}>Branch<select className={inputClass} value={branchFilter} onChange={(event) => setBranchFilter(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className={labelClass}>Due from<input className={inputClass} type="date" value={dueFrom} max={dueTo || undefined} onChange={(event) => setDueFrom(event.target.value)} /></label>
          <label className={labelClass}>Due to<input className={inputClass} type="date" value={dueTo} min={dueFrom || undefined} onChange={(event) => setDueTo(event.target.value)} /></label>
          <div className="flex items-end justify-between gap-3 sm:col-span-2 xl:col-span-4">
            <p className="m-0 text-xs text-[#829087]" aria-live="polite">Showing {visibleAgreements.length} of {agreements.length} agreements</p>
            {(agreementSearch || branchFilter || dueFrom || dueTo || agreementFilter !== "ALL") && <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-sm font-medium text-brand hover:underline" onClick={() => { setAgreementSearch(""); setBranchFilter(""); setDueFrom(""); setDueTo(""); setAgreementFilter("ALL"); }}>Clear filters</button>}
          </div>
        </div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1000px] border-collapse text-left text-sm">
          <thead className="bg-[#f7f9f7] text-xs tracking-wide text-[#75827a]"><tr><th className="p-3">AGREEMENT</th><th className="p-3">CUSTOMER</th><th className="p-3">BRANCH</th><th className="p-3">ITEMS</th><th className="p-3">PAID</th><th className="p-3">LEFT</th><th className="p-3">STATUS</th><th className="p-3">DETAILS</th></tr></thead>
          <tbody>{visibleAgreements.map((agreement) => {
            const left = Math.max(0, number(agreement.total) - number(agreement.paidTotal));
            const next = agreement.installments.find((installment) => installment.status !== "PAID" && installment.status !== "CANCELLED");
            const isOverdue = agreement.status === "ACTIVE" && agreement.installments.some((installment) => installment.status === "OVERDUE" || (number(installment.amount) > number(installment.paidAmount) && new Date(installment.dueAt).getTime() < Date.now()));
            return <Fragment key={agreement.id}>
              <tr key={agreement.id} className="border-t border-[#edf1ed] align-top">
                <td className="p-3"><strong className="font-medium text-[#35453b]">{agreement.number}</strong><small className="mt-1 block text-xs text-[#929d95]">{displayDate(agreement.createdAt)}</small></td>
                <td className="p-3"><strong className="block font-medium text-[#35453b]">{agreement.customer.name}</strong><span className="mt-1 block text-xs text-[#75827a]">{agreement.customer.phone || "No phone number"}</span><span className="block text-xs text-[#929d95]">{agreement.customer.email || "No email address"}</span></td><td className="p-3">{agreement.branch.name}</td>
                <td className="max-w-[260px] whitespace-normal p-3">{agreement.lines.map((line) => `${line.productName} x ${number(line.quantity)}`).join(", ")}</td>
                <td className="p-3">{money(number(agreement.paidTotal))}</td><td className="p-3">{money(left)}</td>
                <td className="p-3"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${isOverdue ? "bg-[#fff2e7] text-[#a56a20]" : agreement.status === "ACTIVE" ? "bg-[#e8f5ee] text-[#367454]" : agreement.status === "COMPLETED" ? "bg-[#edf2fa] text-[#4c6e9a]" : "bg-[#f1f4f1] text-[#68756d]"}`}>{isOverdue ? "Payment late" : agreement.status === "ACTIVE" ? "In progress" : agreement.status === "COMPLETED" ? "Completed" : "Cancelled"}</span>{next && <small className="mt-1 block text-xs text-[#929d95]">Next due {displayDate(next.dueAt)}</small>}</td>
                <td className="p-3"><button className="cursor-pointer border-0 bg-transparent p-0 font-medium text-brand hover:underline" onClick={() => setExpanded(expanded === agreement.id ? null : agreement.id)}>{expanded === agreement.id ? "Hide schedule" : "View schedule"}</button>{agreement.status === "ACTIVE" && <button className="ml-3 cursor-pointer border-0 bg-transparent p-0 text-xs text-[#a5554a] hover:underline" onClick={() => { setError(""); setAction({ kind: "cancel", agreement }); }}>Cancel / refund</button>}</td>
              </tr>
              {expanded === agreement.id && <tr key={`${agreement.id}-schedule`} className="border-t border-[#edf1ed] bg-[#fbfcfb]"><td colSpan={8} className="p-4">
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-[#e8ede8] bg-white p-4"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-brand"><AdminUiIcon name="person" /></span><div className="min-w-0"><strong className="block text-sm font-semibold text-[#26372d]">{agreement.customer.name}</strong><div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#75827a]"><span>{agreement.customer.phone || "No phone number"}</span><span>{agreement.customer.email || "No email address"}</span><span>Branch: {agreement.branch.name}</span></div></div><div className="ml-auto text-right"><span className="block text-xs text-[#75827a]">Amount left</span><strong className="text-sm font-semibold text-[#26372d]">{money(left)}</strong></div></div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm font-medium text-[#35453b]">Payment schedule</strong><p className="mb-0 mt-1 text-xs text-[#829087]">{agreement.lines.map((line) => `${line.productName}: ${number(line.quantity)} at ${money(number(line.unitPrice))} each`).join(" · ")}</p></div><span className="text-sm text-[#536159]">Agreed total <strong>{money(number(agreement.total))}</strong></span></div>
                <div className="grid gap-2">{agreement.installments.map((installment) => {
                  const balance = Math.max(0, number(installment.amount) - number(installment.paidAmount));
                  return <div key={installment.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-3">
                    <div className="grid gap-1"><strong className="text-sm font-medium text-[#35453b]">Payment {installment.sequence} · {money(number(installment.amount))}</strong><span className="text-xs text-[#75827a]">Due {displayDate(installment.dueAt)} · Paid {money(number(installment.paidAmount))} · Left {money(balance)}</span><span className="text-xs capitalize text-[#929d95]">{installment.status.toLowerCase().replaceAll("_", " ")}</span>{installment.payments.map((payment) => <small key={payment.id} className="text-xs text-[#75827a]">Received {money(number(payment.amount))} by {payment.payment.method.replaceAll("_", " ").toLowerCase()} · Ref {payment.payment.reference}{payment.payment.paidAt ? ` · ${displayDate(payment.payment.paidAt)}` : ""}</small>)}</div>
                    <div className="flex flex-wrap gap-2">{agreement.status === "ACTIVE" && balance > 0 && <><button className={secondaryButton} onClick={() => { setError(""); setAction({ kind: "pay", agreement, installment }); }}>Record payment</button><button className={secondaryButton} onClick={() => { setError(""); setAction({ kind: "extend", agreement, installment }); }}>Extend deadline</button></>}</div>
                  </div>;
                })}</div>
                {agreement.refunds.length > 0 && <div className="mt-3 grid gap-1 text-xs text-[#8e5c52]">{agreement.refunds.map((refund) => <span key={refund.id}>Refunded {money(number(refund.amount))} by {refund.method.replaceAll("_", " ").toLowerCase()} on {displayDate(refund.createdAt)} · {refund.reason}</span>)}</div>}
              </td></tr>}
            </Fragment>;
          })}{!visibleAgreements.length && <tr><td colSpan={8} className="p-2">{!agreements.length ? <AdminEmptyState icon="calendar" title="No payment plans yet" description="Create a plan with the button above when a customer will pay over time." /> : <p className="m-0 p-6 text-center text-sm text-[#829087]">No agreements match these filters. Change or clear the filters to see more.</p>}</td></tr>}</tbody>
        </table></div>
      </section>

      {action && typeof document !== "undefined" && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setAction(null); }}>
        <AdminDialogPanel role="dialog" aria-modal="true" aria-labelledby="action-title" onEscape={() => setAction(null)} className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[14px] border border-line bg-white p-4 shadow-2xl">
          <div className="mb-4"><h2 id="action-title" className="m-0 text-lg font-semibold text-[#1a2a22]">{action.kind === "pay" ? "Record customer payment" : action.kind === "extend" ? "Extend payment deadline" : "Cancel agreement and refund"}</h2><p className="mb-0 mt-1 text-sm text-[#75827a]">{action.agreement.number} · {action.agreement.customer.name}</p></div>
          <form onSubmit={(event) => void submitAction(event)} className="grid gap-3">
            {action.kind === "pay" && <>
              <p className="m-0 rounded-lg bg-[#f5f8f5] p-3 text-sm text-[#536159]">Amount due for payment {action.installment.sequence}: <strong>{money(number(action.installment.amount) - number(action.installment.paidAmount))}</strong></p>
              <label className={labelClass}>Amount received<input className={inputClass} type="number" name="amount" min="0.01" max={number(action.installment.amount) - number(action.installment.paidAmount)} step="0.01" required /></label>
              <label className={labelClass}>Payment method<select className={inputClass} name="method"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
              <label className={labelClass}>Receipt / transfer reference<input className={inputClass} name="reference" maxLength={80} required /></label>
            </>}
            {action.kind === "extend" && <>
              <label className={labelClass}>New payment deadline<input className={inputClass} name="dueAt" type="date" min={new Date(new Date(action.installment.dueAt).getTime() + 86_400_000).toISOString().slice(0, 10)} defaultValue={new Date(new Date(action.installment.dueAt).getTime() + 86_400_000).toISOString().slice(0, 10)} required /></label>
              <label className={labelClass}>Reason for extension<input className={inputClass} name="reason" maxLength={500} required /></label>
            </>}
            {action.kind === "cancel" && <>
              <p className="m-0 rounded-lg bg-[#fff8ed] p-3 text-sm text-[#856b3d]">This returns all instalment payments already made ({money(action.agreement.payments.reduce((sum, payment) => sum + number(payment.amount) - number(payment.refundedAmount), 0))}), releases the reserved items and ends the plan.</p>
              <label className={labelClass}>Refund method<select className={inputClass} name="method"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
              <label className={labelClass}>Refund reference<input className={inputClass} name="reference" maxLength={80} required /></label>
              <label className={labelClass}>Reason<input className={inputClass} name="reason" maxLength={500} required /></label>
            </>}
            {error && <p role="alert" className="m-0 text-sm text-[#b44f44]">{error}</p>}
            <div className="mt-2 flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setAction(null)}>Go back</button><button className={primaryButton} disabled={busy}>{busy ? "Saving..." : "Confirm"}</button></div>
          </form>
        </AdminDialogPanel>
      </div>, document.body)}
    </main>
  );
}
