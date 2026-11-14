"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBranches } from "@/hooks/queries/use-branches";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBusiness } from "@/hooks/queries/use-business";
import { useProducts } from "@/hooks/queries/use-products";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { AdminDialogPanel } from "@/components/admin-motion";
import { createPosSale, salesKeys } from "@/services/sales/sales.service";
import { recordCustomerPayment, customerKeys } from "@/services/customers/customer.service";
import { creditorKeys, createCreditor, getCreditors, type Creditor, type CreditorSale } from "@/services/customers/creditor.service";

type Branch = { id: string; name: string; isDefault: boolean };
type Product = { id: string; name: string; sku: string; unit: string; state: string; sellingPrice: string | number };
type DraftLine = { productId: string; quantity: string; unitPrice: string };
type Filter = "ALL" | "OWING" | "OVERDUE";

const amount = (value: number | string | null | undefined) => Number(value ?? 0);
const money = (value: number, currency: string) => new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(value || 0);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value)) : "No deadline";
const fieldClass = "h-10 w-full rounded-[10px] border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a] outline-none focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec]";
const labelClass = "grid gap-1.5 text-sm text-[#536159]";
const primaryClass = "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-brand bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60";
const secondaryClass = "inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[#dfe6e0] bg-white px-4 text-sm font-medium text-[#4e5e54] transition-colors hover:bg-[#f8faf8] disabled:cursor-wait disabled:opacity-60";

function salePaid(sale: CreditorSale) {
  return sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + amount(entry.amount), 0);
}
function saleBalance(sale: CreditorSale) {
  return Math.max(0, amount(sale.total) - salePaid(sale) - sale.returns.reduce((sum, item) => sum + amount(item.total), 0));
}

export default function CreditorsPage() {
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user;
  const businessQuery = useBusiness<{ currency: string }>();
  const branchesQuery = useBranches<Branch>(user?.role === "OWNER");
  const productsQuery = useProducts("");
  const creditorsQuery = useQuery({ queryKey: creditorKeys.all, queryFn: getCreditors, enabled: user?.role === "OWNER", staleTime: 30_000 });
  const branches = branchesQuery.data?.data ?? [];
  const products = (productsQuery.data?.data ?? []).filter((product) => product.state === "ACTIVE") as Product[];
  const creditors = creditorsQuery.data?.data ?? [];
  const [filter, setFilter] = useState<Filter>("ALL");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creditorType, setCreditorType] = useState<"PERSONAL" | "COMPANY">("COMPANY");
  const [lines, setLines] = useState<DraftLine[]>([{ productId: "", quantity: "1", unitPrice: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentSaleId, setPaymentSaleId] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [branchId, setBranchId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const currency = businessQuery.data?.data.currency || "NGN";
  const selectedCreditor = creditors.find((creditor) => creditor.id === selectedId) ?? null;
  const filtered = useMemo(() => creditors.filter((creditor) => {
    const matchesSearch = `${creditor.name} ${creditor.contactPerson ?? ""} ${creditor.phone ?? ""} ${creditor.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase());
    const matchesFilter = filter === "ALL" || (filter === "OWING" && creditor.outstandingBalance > 0) || (filter === "OVERDUE" && creditor.overdueBalance > 0);
    return matchesSearch && matchesFilter;
  }), [creditors, filter, search]);
  const totals = creditors.reduce((summary, creditor) => ({
    balance: summary.balance + creditor.outstandingBalance,
    overdue: summary.overdue + creditor.overdueBalance,
    accounts: summary.accounts + (creditor.outstandingBalance > 0 ? 1 : 0),
  }), { balance: 0, overdue: 0, accounts: 0 });
  const usedProducts = new Set(lines.map((line) => line.productId).filter(Boolean));
  const selectedBranchId = branchId || branches.find((branch) => branch.isDefault)?.id || branches[0]?.id || "";
  const payableSales = selectedCreditor?.sales.filter((sale) => saleBalance(sale) > 0) ?? [];

  useEffect(() => {
    if (selectedCreditor) setDueDate(new Date(Date.now() + selectedCreditor.creditDays * 86_400_000).toISOString().slice(0, 10));
    else setDueDate("");
  }, [selectedCreditor?.id, selectedCreditor?.creditDays]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: creditorKeys.all }),
      queryClient.invalidateQueries({ queryKey: customerKeys.all }),
      queryClient.invalidateQueries({ queryKey: salesKeys.all }),
      invalidateAdminSummaries(queryClient),
    ]);
  }

  async function submitCreditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true); setError(""); setNotice("");
    try {
      const companyName = String(form.get("companyName") ?? "").trim();
      const personalName = String(form.get("name") ?? "").trim();
      const created = await createCreditor({
        type: creditorType,
        name: creditorType === "COMPANY" ? companyName : personalName,
        companyName: creditorType === "COMPANY" ? companyName : undefined,
        contactPerson: form.get("contactPerson") || undefined,
        phone: form.get("phone") || undefined,
        email: form.get("email") || undefined,
        address: form.get("address") || undefined,
        creditLimit: Number(form.get("creditLimit")),
        creditDays: Number(form.get("creditDays")),
      });
      await refresh();
      setSelectedId(created.data.id);
      setShowCreate(false);
      setNotice(`${created.data.name} has been added to your creditor accounts.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save this creditor.");
    } finally { setBusy(false); }
  }

  async function submitCreditSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCreditor) return;
    const formElement = event.currentTarget;
    const form = new FormData(event.currentTarget);
    const creditLines = lines.filter((line) => line.productId).map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitPrice: Number(line.unitPrice) }));
    if (!creditLines.length || creditLines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitPrice) || line.unitPrice <= 0)) {
      setError("Add at least one item and enter its quantity and agreed price."); return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createPosSale<{ id: string; number: string }>({
        branchId: selectedBranchId,
        customerId: selectedCreditor.id,
        creditReference: form.get("creditReference") || undefined,
        dueAt: form.get("dueAt"),
        channel: "MANUAL",
        lines: creditLines,
        payments: [],
      }, `credit-${crypto.randomUUID()}`);
      await refresh();
      setLines([{ productId: "", quantity: "1", unitPrice: "" }]);
      formElement.reset();
      setNotice(`Goods issued and ${result.data.number} recorded. The account is now due by the agreed date.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record this credit sale.");
    } finally { setBusy(false); }
  }

  async function submitPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCreditor || !paymentSaleId) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await recordCustomerPayment(selectedCreditor.id, { method: paymentMethod, reference: paymentReference, allocations: [{ saleId: paymentSaleId, amount: Number(paymentAmount) }] });
      await refresh();
      setPaymentAmount(""); setPaymentReference("");
      setNotice("Payment received and added to the account history.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not record this payment.");
    } finally { setBusy(false); }
  }

  if (userQuery.isLoading) return <AdminPageSkeleton />;
  if (user?.role !== "OWNER") return <main className="mx-auto max-w-3xl p-8"><section className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><h1 className="m-0 text-xl font-semibold">Owner access needed</h1><p className="mb-0 mt-2 text-sm text-muted">Only the business owner can manage creditor accounts.</p></section></main>;

  return <main className="mx-auto w-full max-w-screen-2xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="mb-2 text-xs font-medium tracking-wide text-[#718b79]">ACCOUNTS</p><h1 className="m-0 text-2xl font-semibold tracking-tight text-[#1a2a22]">Creditors</h1><p className="mb-0 mt-1 text-sm text-muted">Track companies and people who take goods now and pay later.</p></div>
      <button type="button" className={primaryClass} onClick={() => { setShowCreate(true); setError(""); }}><AdminUiIcon name="plus" />Add creditor</button>
    </header>

    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-[14px] border border-[#dcebe0] bg-[#f1f8f3] px-4 py-3 text-sm text-[#4b7557]">{notice}<button type="button" aria-label="Dismiss" className="grid size-8 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-inherit hover:bg-white/60" onClick={() => setNotice("")}><AdminUiIcon name="close" size={15} /></button></div>}
    {!showCreate && error && <div role="alert" className="flex items-start justify-between gap-3 rounded-[14px] border border-[#f0d7d2] bg-[#fff5f2] px-4 py-3 text-sm text-[#a5554a]">{error}<button type="button" aria-label="Dismiss error" className="grid size-8 cursor-pointer place-items-center rounded-[10px] border-0 bg-transparent text-inherit hover:bg-white/60" onClick={() => setError("")}><AdminUiIcon name="close" size={15} /></button></div>}
    {creditorsQuery.isError && <div role="alert" className="rounded-[14px] border border-[#f0d7d2] bg-[#fff5f2] p-4 text-sm text-[#a5554a]">Could not load creditor accounts. <button type="button" className="ml-2 cursor-pointer underline" onClick={() => void creditorsQuery.refetch()}>Try again</button></div>}

    <section className="grid grid-cols-3 gap-4 max-[700px]:grid-cols-1" aria-label="Creditor account totals">
      <article className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><span className="grid size-8 place-items-center rounded-lg bg-[#eaf4f2] text-brand"><AdminUiIcon name="money" /></span><div><span className="block text-sm text-muted">Total still owed</span><strong className="block text-lg font-semibold text-[#26372d]">{money(totals.balance, currency)}</strong></div></article>
      <article className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><span className="grid size-8 place-items-center rounded-lg bg-[#fff3e7] text-[#a66e2c]"><AdminUiIcon name="clock" /></span><div><span className="block text-sm text-muted">Past payment date</span><strong className="block text-lg font-semibold text-[#a66e2c]">{money(totals.overdue, currency)}</strong></div></article>
      <article className="flex items-center gap-3 rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><span className="grid size-8 place-items-center rounded-lg bg-[#edf5ef] text-[#477c5c]"><AdminUiIcon name="person" /></span><div><span className="block text-sm text-muted">Accounts with balance</span><strong className="block text-lg font-semibold text-[#26372d]">{totals.accounts}</strong></div></article>
    </section>

    {showCreate && createPortal((
      <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowCreate(false); }}>
        <AdminDialogPanel className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-[0_24px_70px_#17251f42] max-[620px]:p-4" role="dialog" aria-modal="true" aria-labelledby="creditor-create-title" onEscape={() => setShowCreate(false)}>
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 id="creditor-create-title" className="m-0 text-lg font-semibold text-[#26372d]">Add a creditor account</h2><p className="mb-0 mt-1 text-sm text-muted">Save their details and the agreed credit limit and payment time.</p></div>
            <button type="button" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-muted hover:bg-canvas" onClick={() => setShowCreate(false)} aria-label="Close"><AdminUiIcon name="close" size={15} /></button>
          </div>
          <form onSubmit={(event) => void submitCreditor(event)} className="grid gap-4">
            <div className="flex w-fit rounded-[10px] bg-[#f3f5f3] p-1" role="group" aria-label="Creditor type">{(["COMPANY", "PERSONAL"] as const).map((type) => <button key={type} type="button" aria-pressed={creditorType === type} onClick={() => setCreditorType(type)} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${creditorType === type ? "bg-white text-brand shadow-sm" : "text-muted hover:text-[#26372d]"}`}><AdminUiIcon name={type === "COMPANY" ? "company" : "person"} size={15} />{type === "COMPANY" ? "Company" : "Person"}</button>)}</div>
            <div className="grid grid-cols-2 gap-3 max-[700px]:grid-cols-1">
              {creditorType === "COMPANY" ? <label className={labelClass}>Company name<input name="companyName" className={fieldClass} required maxLength={180} placeholder="Company or organisation" /></label> : <label className={labelClass}>Full name<input name="name" className={fieldClass} required maxLength={180} placeholder="Person's full name" /> </label>}
              <label className={labelClass}>{creditorType === "COMPANY" ? "Contact person" : "Contact name (if different)"}<input name="contactPerson" className={fieldClass} maxLength={180} placeholder="Who should we speak to?" /></label>
              <label className={labelClass}>Phone number<input name="phone" className={fieldClass} type="tel" maxLength={40} /></label>
              <label className={labelClass}>Email address<input name="email" className={fieldClass} type="email" /></label>
              <label className={labelClass}>Address<input name="address" className={fieldClass} maxLength={1000} /></label>
              <label className={labelClass}>Credit limit<input name="creditLimit" className={fieldClass} type="number" min="0" step="0.01" required defaultValue="0" /></label>
              <label className={labelClass}>Payment due in (days)<input name="creditDays" className={fieldClass} type="number" min="1" max="365" required defaultValue="30" /></label>
            </div>
            {error && <p role="alert" className="m-0 rounded-lg border border-[#f0d7d2] bg-[#fff5f2] px-3 py-2 text-sm text-[#a5554a]">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" className={secondaryClass} onClick={() => setShowCreate(false)}>Cancel</button><button className={primaryClass} disabled={busy}>{busy ? "Saving..." : "Save creditor"}</button></div>
          </form>
        </AdminDialogPanel>
      </div>
    ), document.body)}

    <section className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,.9fr)]">
      <div className="overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_1px_2px_rgba(23,39,32,.04)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div><h2 className="m-0 text-base font-semibold text-[#26372d]">Creditor accounts</h2><p className="mb-0 mt-1 text-sm text-muted">Select an account to issue goods or record payment.</p></div><label className="sr-only" htmlFor="creditor-search">Search creditor accounts</label><input id="creditor-search" className={`${fieldClass} max-w-[260px]`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or contact" /></div>
        <div className="flex gap-1 border-b border-line px-4 py-2" role="group" aria-label="Filter creditor accounts">{(["ALL", "OWING", "OVERDUE"] as Filter[]).map((item) => <button key={item} type="button" aria-pressed={filter === item} onClick={() => setFilter(item)} className={`cursor-pointer rounded-[10px] px-3 py-2 text-xs font-medium ${filter === item ? "bg-[#eaf4f2] text-brand" : "text-muted hover:bg-canvas"}`}>{item === "ALL" ? "All accounts" : item === "OWING" ? "With balance" : "Past due"}</button>)}</div>
        {creditorsQuery.isLoading ? <div className="grid gap-3 p-4" aria-label="Loading creditor accounts"><div className="h-14 animate-pulse rounded-lg bg-canvas"/><div className="h-14 animate-pulse rounded-lg bg-canvas"/><div className="h-14 animate-pulse rounded-lg bg-canvas"/></div> : !filtered.length ? <div className="px-6 py-12 text-center"><span className="mx-auto mb-3 grid size-11 place-items-center rounded-lg bg-[#f3f5f3] text-muted"><AdminUiIcon name="person" size={20} /></span><strong className="text-sm font-medium text-[#35453b]">No creditor accounts found</strong><p className="mb-0 mt-1 text-sm text-muted">Add a company or person to start tracking credit goods.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse text-left text-sm"><thead className="bg-[#f7f9f7] text-xs text-muted"><tr><th className="px-3 py-2.5 font-medium">NAME</th><th className="px-3 py-2.5 font-medium">CONTACT</th><th className="px-3 py-2.5 text-right font-medium">OWED</th><th className="px-3 py-2.5 text-right font-medium">PAST DUE</th><th className="px-3 py-2.5 font-medium">TERMS</th></tr></thead><tbody>{filtered.map((creditor) => <tr key={creditor.id} className={`cursor-pointer border-t border-[#edf1ed] transition-colors hover:bg-[#f8faf8] ${selectedId === creditor.id ? "bg-[#f1f8f3]" : ""}`} onClick={() => { setSelectedId(creditor.id); setPaymentSaleId(""); }}><td className="px-3 py-2.5"><strong className="block font-medium text-[#35453b]">{creditor.name}</strong><span className="mt-1 inline-flex rounded-full bg-[#f0f3f0] px-2 py-0.5 text-[11px] text-[#68756d]">{creditor.type === "COMPANY" ? "Company" : "Person"}</span></td><td className="px-3 py-2.5 text-[#75827a]">{creditor.contactPerson || creditor.phone || creditor.email || "No contact details"}</td><td className="px-3 py-2.5 text-right font-medium text-[#35453b]">{money(creditor.outstandingBalance, currency)}</td><td className="px-3 py-2.5 text-right"><span className={creditor.overdueBalance > 0 ? "font-medium text-[#a66e2c]" : "text-muted"}>{money(creditor.overdueBalance, currency)}</span></td><td className="px-3 py-2.5 text-[#75827a]">{creditor.creditDays} days</td></tr>)}</tbody></table></div>}
      </div>

      {selectedCreditor ? <div className="space-y-4">
        <section className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]">
          <div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#eaf4f2] text-brand"><AdminUiIcon name={selectedCreditor.type === "COMPANY" ? "company" : "person"} /></span><div className="min-w-0"><span className="text-xs text-muted">{selectedCreditor.type === "COMPANY" ? "Company account" : "Personal account"}</span><h2 className="m-0 truncate text-lg font-semibold text-[#26372d]">{selectedCreditor.name}</h2><p className="mb-0 mt-1 text-sm text-muted">{selectedCreditor.contactPerson ? `Contact: ${selectedCreditor.contactPerson}` : ""}{selectedCreditor.phone ? `${selectedCreditor.contactPerson ? " · " : ""}${selectedCreditor.phone}` : ""}</p><p className="mb-0 mt-1 text-sm text-muted">{selectedCreditor.email || "No email address"}{selectedCreditor.address ? ` · ${selectedCreditor.address}` : ""}</p></div></div>
          <div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-[#f6f8f6] p-3"><span className="block text-xs text-muted">Owed now</span><strong className="mt-1 block text-base font-semibold">{money(selectedCreditor.outstandingBalance, currency)}</strong></div><div className="rounded-lg bg-[#fff8ef] p-3"><span className="block text-xs text-[#9b7748]">Credit limit left</span><strong className="mt-1 block text-base font-semibold text-[#7f633d]">{money(Math.max(0, amount(selectedCreditor.creditLimit) - selectedCreditor.outstandingBalance), currency)}</strong></div></div>
        </section>

        <section className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]">
          <div className="mb-4"><h3 className="m-0 text-base font-semibold text-[#26372d]">Record goods taken on credit</h3><p className="mb-0 mt-1 text-sm text-muted">The sale and amount owed are recorded when goods leave the shop.</p></div>
          <form className="grid gap-3" onSubmit={(event) => void submitCreditSale(event)}>
            <label className={labelClass}>Shop branch<select className={fieldClass} value={selectedBranchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Select branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <label className={labelClass}>Work or agreement reference <span className="font-normal text-muted">(optional)</span><input className={fieldClass} name="creditReference" maxLength={100} placeholder="Project or work name" /></label>
            <label className={labelClass}>Payment due date<input className={fieldClass} name="dueAt" type="date" min={new Date().toISOString().slice(0, 10)} required value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <div className="grid gap-3"><div className="flex items-center justify-between gap-2"><div><strong className="text-sm font-medium text-[#35453b]">Goods to issue</strong><p className="mb-0 mt-1 text-xs text-muted">Add one item or make a group with several items.</p></div><button type="button" className={secondaryClass} onClick={() => setLines((current) => [...current, { productId: "", quantity: "1", unitPrice: "" }])}><AdminUiIcon name="plus" size={15} />Add item</button></div>
              {lines.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_95px_125px_40px] items-end gap-2 max-[700px]:grid-cols-2"><label className={`${labelClass} max-[700px]:col-span-2`}>Product<select className={fieldClass} value={line.productId} required onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, productId: event.target.value, unitPrice: String(products.find((product) => product.id === event.target.value)?.sellingPrice ?? "") } : item))}><option value="">Select goods</option>{products.map((product) => <option key={product.id} value={product.id} disabled={usedProducts.has(product.id) && product.id !== line.productId}>{product.name} · {product.sku}</option>)}</select></label><label className={labelClass}>Qty<input className={fieldClass} type="number" min="0.001" step="0.001" required value={line.quantity} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, quantity: event.target.value } : item))} /></label><label className={labelClass}>Price each<input className={fieldClass} type="number" min="0.01" step="0.01" required value={line.unitPrice} onChange={(event) => setLines((current) => current.map((item, i) => i === index ? { ...item, unitPrice: event.target.value } : item))} /></label><button type="button" aria-label="Remove item" title="Remove item" disabled={lines.length === 1} className="grid size-10 cursor-pointer place-items-center rounded-[10px] border border-[#dfe6e0] bg-white text-[#8e5c52] transition-colors hover:bg-[#fff5f2] disabled:cursor-not-allowed disabled:opacity-40" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><AdminUiIcon name="trash" size={15} /></button></div>)}
            </div>
            <p className="m-0 rounded-lg bg-[#f6f8f6] p-3 text-xs leading-relaxed text-muted">Goods are deducted from branch stock now. The transaction appears in sales and the unpaid amount stays on this account until a payment is recorded.</p>
            <button className={`${primaryClass} w-full`} disabled={busy || !branches.length || !products.length}>{busy ? "Recording goods..." : "Issue goods on credit"}</button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[14px] border border-line bg-white shadow-[0_1px_2px_rgba(23,39,32,.04)]">
          <div className="border-b border-line p-4"><h3 className="m-0 text-base font-semibold text-[#26372d]">Account activity</h3><p className="mb-0 mt-1 text-sm text-muted">Credit sales, goods and due dates for this account.</p></div>
          {!selectedCreditor.sales.length ? <AdminEmptyState icon="box" title="No goods issued yet" description="Goods taken on credit and their payment dates will appear in this account." /> : <div className="divide-y divide-line">{selectedCreditor.sales.map((sale) => { const paid = salePaid(sale); const balance = saleBalance(sale); const overdue = balance > 0 && Boolean(sale.dueAt && new Date(sale.dueAt).getTime() < Date.now()); return <article key={sale.id} className="grid gap-2 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-sm font-medium text-[#35453b]">{sale.number}</strong><span className="ml-2 text-xs text-muted">{date(sale.createdAt)}</span>{sale.creditReference && <span className="mt-1 block text-xs text-muted">Work: {sale.creditReference}</span>}</div><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${balance <= 0.005 ? "bg-[#edf5ef] text-[#477c5c]" : overdue ? "bg-[#fff3e7] text-[#a66e2c]" : "bg-[#edf5ef] text-[#478264]"}`}>{balance <= 0.005 ? "Paid" : paid > 0 ? "Part paid" : overdue ? "Past due" : "Unpaid"}</span></div><p className="m-0 text-xs leading-relaxed text-[#75827a]">{sale.lines.map((line) => `${line.productName} × ${amount(line.quantity)}`).join(", ")}</p><div className="flex flex-wrap justify-between gap-2 text-xs"><span className="text-muted">Due {date(sale.dueAt)} · {sale.branch.name}</span><strong className={balance > 0 ? "text-[#35453b]" : "text-[#477c5c]"}>{money(paid, currency)} paid · {money(balance, currency)} remaining</strong></div></article>; })}</div>}
        </section>

        {payableSales.length > 0 && <section className="rounded-[14px] border border-line bg-white p-4 shadow-[0_1px_2px_rgba(23,39,32,.04)]"><div className="mb-4"><h3 className="m-0 text-base font-semibold text-[#26372d]">Record a payment</h3><p className="mb-0 mt-1 text-sm text-muted">Apply money received to one credit sale.</p></div><form className="grid gap-3" onSubmit={(event) => void submitPayment(event)}><label className={labelClass}>Sale or receipt<select className={fieldClass} value={paymentSaleId} onChange={(event) => { setPaymentSaleId(event.target.value); const sale = payableSales.find((item) => item.id === event.target.value); setPaymentAmount(sale ? String(saleBalance(sale)) : ""); }} required><option value="">Choose an amount owed</option>{payableSales.map((sale) => <option key={sale.id} value={sale.id}>{sale.number} · {money(saleBalance(sale), currency)} left</option>)}</select></label><label className={labelClass}>Amount received<input className={fieldClass} type="number" min="0.01" step="0.01" max={paymentSaleId ? saleBalance(payableSales.find((sale) => sale.id === paymentSaleId)!) : undefined} value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} required /></label><div className="grid grid-cols-2 gap-3"><label className={labelClass}>How paid<select className={fieldClass} value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label><label className={labelClass}>Receipt / transfer ref<input className={fieldClass} value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} required maxLength={80} /></label></div><button className={primaryClass} disabled={busy || !paymentSaleId}>{busy ? "Saving payment..." : "Record payment"}</button></form></section>}
      </div> : <aside className="rounded-[14px] border border-dashed border-[#d9e2da] bg-white px-4 py-12 text-center shadow-[0_1px_2px_rgba(23,39,32,.04)]"><span className="mx-auto mb-3 grid size-8 place-items-center rounded-lg bg-[#eaf4f2] text-brand"><AdminUiIcon name="person" /></span><strong className="text-sm font-medium text-[#35453b]">Choose a creditor account</strong><p className="mb-0 mt-1 text-sm text-muted">Their contact details, balances and account activity will show here.</p></aside>}
    </section>
  </main>;
}
