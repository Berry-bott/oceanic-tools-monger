"use client";

import { useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminPageSkeleton, AdminTableSkeleton } from "@/components/admin-loading-skeleton";
import { AdminDialogPanel } from "@/components/admin-motion";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useRecordExpense } from "@/hooks/mutations/use-finance-mutations";
import { apiRequest } from "@/lib/api";
import { financeKeys } from "@/services/finance/finance.service";

type Branch = { id: string; name: string };
type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number | string;
  incurredAt: string;
  user: { name: string };
  payment: { method: string; reference: string; status: string };
  branch?: { name: string } | null;
};

const categories = [
  "Staff payment",
  "Rent",
  "Utilities",
  "Transport",
  "Internet",
  "Office supplies",
  "Repairs and maintenance",
  "Marketing",
  "Other",
];
const noExpenses: Expense[] = [];
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const displayDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(date);
};
const money = (value: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value) || 0);
const paymentLabel = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function ExpensesPage() {
  const currentUser = useCurrentUser();
  const user = currentUser.data?.user;
  const branchesQuery = useBranches<Branch>(user?.role === "OWNER");
  const expensesQuery = useQuery({
    queryKey: [...financeKeys.all, "expenses"],
    queryFn: () => apiRequest<{ data: Expense[] }>("/expenses"),
    enabled: user?.role === "OWNER",
  });
  const recordExpense = useRecordExpense();
  const [category, setCategory] = useState("Staff payment");
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const expenses = expensesQuery.data?.data ?? noExpenses;
  const currency = "NGN";
  const branches = branchesQuery.data?.data ?? [];
  const visibleExpenses = useMemo(() => {
    const query = search.trim().toLowerCase();
    return expenses.filter((expense) =>
      !query || `${expense.category} ${expense.description} ${expense.payment.reference} ${expense.payment.method} ${expense.user.name}`.toLowerCase().includes(query),
    );
  }, [expenses, search]);
  const total = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const staffPayments = expenses.filter((expense) => expense.category.toLowerCase() === "staff payment").reduce((sum, expense) => sum + Number(expense.amount), 0);

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setFormError("");
    setNotice("");
    const recipient = String(form.get("staffName") ?? "").trim();
    const details = String(form.get("description") ?? "").trim();
    const expenseCategory = category === "Other"
      ? String(form.get("otherCategory") ?? "").trim()
      : category;
    const description = category === "Staff payment"
      ? `Staff payment — ${recipient}${details ? `: ${details}` : ""}`
      : details;
    if (!expenseCategory || !description) {
      setFormError(category === "Staff payment" ? "Enter the staff member’s name and payment details." : "Enter an expense category and description.");
      return;
    }

    try {
      await recordExpense.mutateAsync({
        category: expenseCategory,
        description,
        amount: Number(form.get("amount")),
        method: form.get("method"),
        reference: form.get("reference"),
        branchId: form.get("branchId") || undefined,
        incurredAt: form.get("incurredAt") || undefined,
      });
      formElement.reset();
      setCategory("Staff payment");
      setNotice("Expense recorded and posted to the ledger.");
      setExpenseModalOpen(false);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "The expense could not be recorded.");
    }
  }

  if (currentUser.isPending) return <AdminPageSkeleton variant="form" />;
  if (user?.role !== "OWNER") {
    return <main className="mx-auto max-w-3xl p-6"><h1 className="text-xl font-semibold">Owner access required</h1><p className="text-sm text-muted">Only the business owner can record expenses.</p></main>;
  }

  const fieldClass = "grid gap-1.5 text-sm text-[#536159]";
  const inputClass = "h-11 w-full min-w-0 rounded-lg border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a] outline-none focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec]";

  return (
    <main className="mx-auto w-full max-w-screen-xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-xs font-semibold tracking-[.14em] text-[#718b79]">MONEY MANAGEMENT</p>
          <h1 className="m-0 text-2xl font-semibold tracking-tight text-[#1a2a22]">Expenses</h1>
          <p className="mb-0 mt-1 text-sm text-muted">Record staff payments and other business expenses. Every entry is tracked in the ledger.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/reports" className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">View reports</Link>
          <button type="button" onClick={() => { setFormError(""); setExpenseModalOpen(true); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark">
            <AdminUiIcon name="plus" size={16} />Record an expense
          </button>
        </div>
      </header>

      {formError && <p className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
      {notice && <p className="m-0 rounded-lg border border-[#dcebe0] bg-[#f1f8f3] p-3 text-sm text-[#4b7557]" role="status">{notice}</p>}
      {expensesQuery.isError && <p className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">Expense history could not be loaded: {expensesQuery.error instanceof Error ? expensesQuery.error.message : "Please try again."}</p>}

      <section className="grid gap-3 sm:grid-cols-2" aria-label="Expense totals">
        <article className="rounded-xl border border-line bg-white p-4">
          <span className="text-sm text-muted">Recorded expenses</span>
          <strong className="mt-2 block text-xl font-semibold text-ink">{money(total, currency)}</strong>
          <small className="mt-1 block text-xs text-muted">{expenses.length} recorded payments</small>
        </article>
        <article className="rounded-xl border border-line bg-white p-4">
          <span className="text-sm text-muted">Staff payments</span>
          <strong className="mt-2 block text-xl font-semibold text-ink">{money(staffPayments, currency)}</strong>
          <small className="mt-1 block text-xs text-muted">Recorded under the Staff payment category</small>
        </article>
      </section>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
          <div><h2 className="m-0 text-base font-semibold text-ink">Expense history</h2><p className="mb-0 mt-1 text-sm text-muted">Most recent recorded expenses.</p></div>
          <label className="sr-only" htmlFor="expense-search">Search expenses</label>
          <input id="expense-search" className={`${inputClass} max-w-sm`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search category, staff, description or reference" />
        </div>
        {expensesQuery.isLoading ? <AdminTableSkeleton columns={6} rows={5} /> : visibleExpenses.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse text-left text-sm">
              <thead className="bg-[#f8faf8] text-xs font-medium uppercase tracking-wide text-muted"><tr><th className="p-3.5">Date</th><th className="p-3.5">Type</th><th className="p-3.5">Description</th><th className="p-3.5">Payment</th><th className="p-3.5">Reference</th><th className="p-3.5 text-right">Amount</th></tr></thead>
              <tbody>{visibleExpenses.map((expense) => <tr key={expense.id} className="border-t border-line hover:bg-[#fbfcfb]">
                <td className="whitespace-nowrap p-3.5 text-muted">{displayDate(expense.incurredAt)}</td>
                <td className="p-3.5"><span className="inline-flex rounded-full bg-[#edf5ef] px-2.5 py-1 text-xs font-medium text-[#426e50]">{expense.category}</span></td>
                <td className="max-w-[280px] truncate p-3.5 text-[#3d4c44]" title={expense.description}>{expense.description}</td>
                <td className="whitespace-nowrap p-3.5 text-muted">{paymentLabel(expense.payment.method)}</td>
                <td className="p-3.5 text-muted">{expense.payment.reference}</td>
                <td className="whitespace-nowrap p-3.5 text-right font-semibold tabular-nums text-[#26372d]">{money(expense.amount, currency)}</td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : <div className="p-4"><AdminEmptyState icon="search" title={search ? "No matching expenses" : "No expenses recorded"} description={search ? "Try a different search term." : "Record a staff payment or business expense to start tracking it here."} /></div>}
      </section>

      {expenseModalOpen && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !recordExpense.isPending) setExpenseModalOpen(false); }}>
          <AdminDialogPanel role="dialog" aria-modal="true" aria-labelledby="record-expense-title" onEscape={() => { if (!recordExpense.isPending) setExpenseModalOpen(false); }} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-[0_24px_70px_rgba(12,25,25,.24)] sm:p-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="receipt" size={18} /></span>
                <div><h2 id="record-expense-title" className="m-0 text-lg font-semibold text-ink">Record an expense</h2><p className="mb-0 mt-1 text-sm text-muted">Select what you’re paying for, then enter the payment details.</p></div>
              </div>
              <button type="button" onClick={() => { if (!recordExpense.isPending) setExpenseModalOpen(false); }} aria-label="Close dialog" className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:bg-canvas disabled:opacity-50" disabled={recordExpense.isPending}><AdminUiIcon name="close" size={16} /></button>
            </div>
            {formError && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
            <form className="grid gap-4" onSubmit={(event) => void submitExpense(event)}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className={fieldClass}>Expense type
                  <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select>
                </label>
                {category === "Staff payment" && <label className={fieldClass}>Staff member name<input className={inputClass} name="staffName" required maxLength={180} placeholder="Enter staff member’s name" /></label>}
                {category === "Other" && <label className={fieldClass}>Category name<input className={inputClass} name="otherCategory" required maxLength={100} placeholder="e.g. Insurance" /></label>}
                <label className={fieldClass}>Amount<input className={inputClass} name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /></label>
                <label className={fieldClass}>{category === "Staff payment" ? "Payment details" : "Description"}<input className={inputClass} name="description" required maxLength={500} placeholder={category === "Staff payment" ? "e.g. November wages" : "What was this expense for?"} /></label>
                <label className={fieldClass}>Payment method
                  <select className={inputClass} name="method" defaultValue="BANK_TRANSFER"><option value="BANK_TRANSFER">Bank transfer</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="OTHER">Other</option></select>
                </label>
                <label className={fieldClass}>Payment reference<input className={inputClass} name="reference" required maxLength={80} placeholder="Receipt, transfer, or voucher number" /></label>
                <label className={fieldClass}>Branch
                  <select className={inputClass} name="branchId" defaultValue=""><option value="">Business-wide</option>{branches.map((branch: Branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
                </label>
                <label className={fieldClass}>Expense date<input className={inputClass} name="incurredAt" type="date" defaultValue={today()} /></label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="m-0 max-w-xl text-xs leading-5 text-muted">This records an expense payment and posts it to the ledger. Staff payments are tracked as expenses; payroll calculations and deductions are not included.</p>
                <button type="submit" disabled={recordExpense.isPending} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
                  <AdminUiIcon name="check" size={15} />{recordExpense.isPending ? "Recording…" : "Record expense"}
                </button>
              </div>
            </form>
          </AdminDialogPanel>
        </div>,
        document.body,
      )}
    </main>
  );
}
