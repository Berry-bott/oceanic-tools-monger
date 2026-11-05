"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { DashboardSummaryCard } from "@/components/admin-dashboard-widgets";
import { useFinanceOverview } from "@/hooks/queries/use-finance-overview";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import {
  useCreateJournalEntry,
  usePaySupplierInvoice,
  usePostJournalEntry,
  useRecordExpense,
} from "@/hooks/mutations/use-finance-mutations";

type User = { id: string; name: string; email: string; role: string };
type Branch = { id: string; name: string };
type Account = {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
};
type Journal = {
  id: string;
  reference: string;
  description: string;
  postingDate: string;
  status: string;
  lines: {
    debit: number | string;
    credit: number | string;
    account: { code: string; name: string };
  }[];
  createdBy?: { name: string };
};
type Invoice = {
  id: string;
  invoiceNumber: string;
  totalAmount: number | string;
  dueAt?: string | null;
  supplier: { name: string };
  paid: number;
  credits: number;
  outstanding: number;
  overdue: boolean;
};
type Expense = {
  id: string;
  category: string;
  description: string;
  amount: number | string;
  incurredAt: string;
  user: { name: string };
  payment: { method: string; reference: string };
};
type PL = {
  data: { code: string; account: string; type: string; amount: number }[];
  summary: {
    revenue: number;
    netSales: number;
    costOfGoodsSold: number;
    grossProfit: number;
    expenses: number;
    otherIncome: number;
    netProfit: number;
    currency: string;
  };
  period: { from: string; to: string };
};
type BalanceSheet = {
  data: { code: string; account: string; type: string; balance: number }[];
  summary: {
    assets: number;
    liabilities: number;
    equity: number;
    currentEarnings: number;
    outOfBalance: number;
    currency: string;
  };
  asOf: string;
};
const financeRoles = (role?: string) =>
  role === "OWNER" || role === "STAFF";
const writable = (role?: string) => role === "OWNER" || role === "STAFF";
const money = (amount: number | string, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
const date = (value: string) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(
    new Date(value),
  );

export default function FinancePage() {
  const currentUserQuery = useCurrentUser();
  const user = currentUserQuery.data?.user as User | undefined;
  const branchQuery = useBranches<Branch>();
  const branches = branchQuery.data?.data ?? [];
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const financeQuery = useFinanceOverview<Expense, Invoice, PL, BalanceSheet, Account, Journal>(
    financeRoles(user?.role),
  );
  const recordExpenseMutation = useRecordExpense();
  const createJournalMutation = useCreateJournalEntry();
  const postJournalMutation = usePostJournalEntry();
  const payInvoiceMutation = usePaySupplierInvoice();
  const expenses = financeQuery.data?.expenses ?? [];
  const invoices = financeQuery.data?.invoices ?? [];
  const pl = financeQuery.data?.profitLoss;
  const balanceSheet = financeQuery.data?.balanceSheet;
  const accounts = financeQuery.data?.accounts ?? [];
  const journals = financeQuery.data?.journals ?? [];
  const loading = financeQuery.isLoading;
  const pageError = error || (financeQuery.error instanceof Error
    ? financeQuery.error.message
    : financeQuery.isError
      ? "Finance data could not be loaded."
      : branchQuery.error instanceof Error
        ? branchQuery.error.message
        : "");

  const reload = useCallback(async () => {
    setError("");
    await financeQuery.refetch();
  }, []);

  async function createExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("expense");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await recordExpenseMutation.mutateAsync({
        category: form.get("category"),
        description: form.get("description"),
        amount: Number(form.get("amount")),
        method: form.get("method"),
        reference: form.get("reference"),
        branchId: form.get("branchId") || undefined,
        incurredAt: form.get("incurredAt") || undefined,
      });
      setNotice("Expense recorded and posted to the ledger.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Expense could not be recorded.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createJournal(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("journal");
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const amount = Number(form.get("amount"));
    try {
      await createJournalMutation.mutateAsync({
        reference: form.get("reference"),
        description: form.get("description"),
        postingDate: form.get("postingDate"),
        lines: [
          { accountId: form.get("debitAccount"), debit: amount, credit: 0 },
          { accountId: form.get("creditAccount"), debit: 0, credit: amount },
        ],
      });
      setNotice("Balanced journal draft created.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Journal could not be created.",
      );
    } finally {
      setBusy("");
    }
  }

  async function postJournal(id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      await postJournalMutation.mutateAsync(id);
      setNotice("Journal entry posted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Journal could not be posted.");
    } finally {
      setBusy("");
    }
  }

  async function payInvoice(invoice: Invoice) {
    const amountValue = window.prompt(
      `Payment amount for ${invoice.invoiceNumber} (${money(invoice.outstanding)} outstanding):`,
      String(invoice.outstanding),
    );
    if (amountValue === null) return;
    const amount = Number(amountValue);
    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > invoice.outstanding
    ) {
      setError("Enter a payment amount within the outstanding balance.");
      return;
    }
    const method = window.prompt(
      "Payment method: CASH, BANK_TRANSFER, CARD or OTHER",
      "BANK_TRANSFER",
    );
    if (
      !method ||
      !["CASH", "BANK_TRANSFER", "CARD", "OTHER"].includes(method.toUpperCase())
    ) {
      setError("Choose CASH, BANK_TRANSFER, CARD or OTHER.");
      return;
    }
    setBusy(invoice.id);
    setError("");
    setNotice("");
    try {
      await payInvoiceMutation.mutateAsync({
        id: invoice.id,
        input: {
          amount,
          method: method.toUpperCase(),
          reference: `SUP-${crypto.randomUUID().slice(0, 12)}`,
        },
      });
      setNotice("Supplier payment recorded.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Payment could not be recorded.",
      );
    } finally {
      setBusy("");
    }
  }

  if (!user)
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-2.5 text-[#718077] text-sm">
        <span className="h-[35px] w-[35px] rounded-[10px] bg-brand text-white grid [place-items:center] font-normal">
          O
        </span>
        <span>Loading finance</span>
      </main>
    );
  if (!financeRoles(user.role))
    return (
      <main className="min-h-screen grid [align-content:center] [justify-items:center] gap-3 text-center p-6 [&_h1]:text-[22px] [&_h1]:m-0 [&_p]:text-sm [&_p]:text-[#75827a]">
        <h1>Money reports are not available</h1>
        <p>
          This account cannot open money reports. Ask the business owner for
          access.
        </p>
        <Link
          className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
          href="/admin"
        >
          Return to dashboard
        </Link>
      </main>
    );
  const currency =
    pl?.summary.currency || balanceSheet?.summary.currency || "NGN";
  const totalPayables = invoices.reduce(
    (sum, invoice) => sum + Number(invoice.outstanding),
    0,
  );
  const overduePayables = invoices
    .filter((invoice) => invoice.overdue)
    .reduce((sum, invoice) => sum + Number(invoice.outstanding), 0);
  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">
                ACCOUNTING &amp; CASH
              </span>
              <h1>Money and reports</h1>
              <p>
                See sales, money customers owe, supplier bills and account
                records.
              </p>
            </div>
            <span className="text-sm text-[#839087] max-[620px]:hidden">
              Profit &amp; loss {pl?.period.from ?? ""} to {pl?.period.to ?? ""}
            </span>
          </div>
          {pageError && (
            <div
              className="[&_strong]:text-[#a5554a] [&_p]:text-[#8e7974] m-0 text-[#b44f44] text-sm leading-normal"
              role="alert"
            >
              {pageError}
              <button
                className="flex items-center gap-1 text-[#38765a] text-sm font-normal [&:hover]:[text-decoration:underline]"
                onClick={() => void reload()}
              >
                Reload
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
          <section className="mb-4 grid grid-cols-4 gap-3 max-[620px]:grid-cols-2 max-[620px]:gap-2">
            <DashboardSummaryCard
              label="Net sales"
              value={loading ? "" : money(pl?.summary.netSales ?? 0, currency)}
              note="Posted accounting activity"
            />
            <DashboardSummaryCard
              label="Gross profit"
              value={
                loading ? "" : money(pl?.summary.grossProfit ?? 0, currency)
              }
              note="After cost of goods sold"
            />
            <DashboardSummaryCard
              label="Net profit"
              value={loading ? "" : money(pl?.summary.netProfit ?? 0, currency)}
              note="Current report period"
            />
            <DashboardSummaryCard
              label="Supplier bills still unpaid"
              value={loading ? "" : money(totalPayables, currency)}
              note={`${money(overduePayables, currency)} overdue`}
              tone="warning"
            />
          </section>
          <div className="grid [grid-template-columns:minmax(0,1.45fr)_minmax(270px,1fr)] gap-3 mb-3 items-start max-[900px]:grid-cols-1">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Profit and loss</h2>
                  <p>
                    Posted journal lines {pl?.period.from} to {pl?.period.to}
                  </p>
                </div>
                <a
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                  href={`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"}/reports/profit-loss?format=xlsx`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Export XLSX
                </a>
              </div>
              <div className="pt-1 px-[17px] pb-3">
                {pl?.data.map((line) => (
                  <div
                    className="min-h-[43px] flex items-center justify-between gap-3 [border-bottom:1px_solid_#eff2ef] text-[#56665b] text-sm [&:last-child]:[border-bottom:0] [&>span]:grid [&>span]:gap-1 [&>span_strong]:text-sm [&>span_strong]:text-[#415247] [&>span_small]:text-sm [&>span_small]:text-[#9aa49d] [&>b]:text-sm [&>b]:text-[#38493e] [&>b]:whitespace-nowrap"
                    key={line.code}
                  >
                    <span>
                      <strong>{line.account}</strong>
                      <small>
                        {line.code}{" "}
                        {line.type.toLowerCase().replaceAll("_", " ")}
                      </small>
                    </span>
                    <b>{money(line.amount, currency)}</b>
                  </div>
                ))}
                {!pl?.data.length && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    No posted activity in the current report period.
                  </p>
                )}
              </div>
            </section>
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Balance sheet</h2>
                  <p>As of {balanceSheet?.asOf ?? "today"}</p>
                </div>
              </div>
              <div className="pt-1 px-[17px] pb-3">
                {[
                  ["Assets", balanceSheet?.summary.assets],
                  ["Liabilities", balanceSheet?.summary.liabilities],
                  ["Equity", balanceSheet?.summary.equity],
                  ["Current earnings", balanceSheet?.summary.currentEarnings],
                ].map(([label, value]) => (
                  <div
                    className="min-h-[43px] flex items-center justify-between gap-3 [border-bottom:1px_solid_#eff2ef] text-[#56665b] text-sm [&:last-child]:[border-bottom:0] [&>span]:grid [&>span]:gap-1 [&>span_strong]:text-sm [&>span_strong]:text-[#415247] [&>span_small]:text-sm [&>span_small]:text-[#9aa49d] [&>b]:text-sm [&>b]:text-[#38493e] [&>b]:whitespace-nowrap"
                    key={String(label)}
                  >
                    <strong>{label}</strong>
                    <b>{money(Number(value ?? 0), currency)}</b>
                  </div>
                ))}
              </div>
              <p
                className={`mt-0 mx-3.5 mb-3.5 p-[9px] rounded-[5px] text-sm [&.balanced]:bg-[#eff7f0] [&.balanced]:text-[#4c7855] [&.unbalanced]:bg-[#fff2ed] [&.unbalanced]:text-[#a85d4f] ${Math.abs(balanceSheet?.summary.outOfBalance ?? 0) < 0.01 ? "balanced" : "unbalanced"}`}
              >
                {Math.abs(balanceSheet?.summary.outOfBalance ?? 0) < 0.01
                  ? "Balance sheet is in balance"
                  : `Out of balance by ${money(balanceSheet?.summary.outOfBalance ?? 0, currency)}`}
              </p>
            </section>
          </div>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Supplier bills to pay</h2>
                <p>Supplier bills and the amount still to pay.</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>SUPPLIER</th>
                    <th>INVOICE</th>
                    <th>DUE DATE</th>
                    <th>INVOICE TOTAL</th>
                    <th>OUTSTANDING</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => (
                    <tr key={invoice.id}>
                      <td>{invoice.supplier.name}</td>
                      <td>
                        <strong>{invoice.invoiceNumber}</strong>
                      </td>
                      <td>{invoice.dueAt ? date(invoice.dueAt) : ""}</td>
                      <td>{money(invoice.totalAmount, currency)}</td>
                      <td>
                        <strong>{money(invoice.outstanding, currency)}</strong>
                      </td>
                      <td>
                        <span
                          className={`inline-flex py-1 px-[7px] rounded text-sm font-normal [text-transform:capitalize] ${invoice.overdue ? "bg-[#fff6e8] text-[#a77b35]" : "bg-[#edf6ef] text-[#4d805a]"}`}
                        >
                          {invoice.overdue
                            ? "Overdue"
                            : invoice.outstanding > 0
                              ? "Open"
                              : "Paid"}
                        </span>
                      </td>
                      <td>
                        {writable(user.role) && invoice.outstanding > 0 && (
                          <button
                            className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                            disabled={busy === invoice.id}
                            onClick={() => void payInvoice(invoice)}
                          >
                            Record payment
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!invoices.length && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No supplier invoices recorded.
              </p>
            )}
          </section>
          {writable(user.role) && (
            <div className="grid [grid-template-columns:minmax(0,1.45fr)_minmax(270px,1fr)] gap-3 mb-3 items-start max-[900px]:grid-cols-1 [margin-top:12px]">
              <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-[15px] [&>.panel-heading]:mb-3 [&_form]:grid [&_form]:gap-2.5 [&_.form-field]:text-sm [&_.form-field_input]:h-[35px] [&_.form-field_input]:text-sm [&_.form-field_select]:h-[35px] [&_.form-field_select]:text-sm [&_.form-row]:gap-2 [&_.button-primary]:h-[34px] [&_.button-primary]:text-sm max-[620px]:[&_.form-row]:grid-cols-1">
                <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                  <div>
                    <h2>Record expense</h2>
                    <p>Creates the payment and matching journal entry.</p>
                  </div>
                </div>
                <form onSubmit={(event) => void createExpense(event)}>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Category
                      <input
                        name="category"
                        required
                        maxLength={100}
                        placeholder="Rent, utilities"
                      />
                    </label>
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Amount
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                    Description
                    <input name="description" required maxLength={500} />
                  </label>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Payment method
                      <select name="method">
                        <option value="BANK_TRANSFER">Bank transfer</option>
                        <option value="CASH">Cash</option>
                        <option value="CARD">Card</option>
                        <option value="OTHER">Other</option>
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Reference
                      <input name="reference" required maxLength={80} />
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Branch
                      <select name="branchId">
                        <option value="">Business-wide</option>
                        {branches.map((branch) => (
                          <option key={branch.id} value={branch.id}>
                            {branch.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Expense date
                      <input name="incurredAt" type="date" />
                    </label>
                  </div>
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                    disabled={busy === "expense"}
                  >
                    {busy === "expense" ? "Recording" : "Record expense"}
                  </button>
                </form>
              </section>
              <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-[15px] [&>.panel-heading]:mb-3 [&_form]:grid [&_form]:gap-2.5 [&_.form-field]:text-sm [&_.form-field_input]:h-[35px] [&_.form-field_input]:text-sm [&_.form-field_select]:h-[35px] [&_.form-field_select]:text-sm [&_.form-row]:gap-2 [&_.button-primary]:h-[34px] [&_.button-primary]:text-sm max-[620px]:[&_.form-row]:grid-cols-1">
                <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                  <div>
                    <h2>Manual journal draft</h2>
                    <p>Two-line balanced entry; review before posting.</p>
                  </div>
                </div>
                <form onSubmit={(event) => void createJournal(event)}>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Reference
                      <input name="reference" required maxLength={50} />
                    </label>
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Posting date
                      <input
                        name="postingDate"
                        type="date"
                        defaultValue={new Date().toISOString().slice(0, 10)}
                        required
                      />
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                    Description
                    <input name="description" required maxLength={500} />
                  </label>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Debit account
                      <select name="debitAccount" required>
                        {accounts
                          .filter((a) => a.isActive)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} {account.name}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                      Credit account
                      <select name="creditAccount" required>
                        {accounts
                          .filter((a) => a.isActive)
                          .map((account) => (
                            <option key={account.id} value={account.id}>
                              {account.code} {account.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                  <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                    Amount
                    <input
                      name="amount"
                      type="number"
                      min="0.01"
                      step="0.01"
                      required
                    />
                  </label>
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                    disabled={busy === "journal"}
                  >
                    {busy === "journal" ? "Saving" : "Create draft"}
                  </button>
                </form>
              </section>
            </div>
          )}
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden [margin-top:12px]">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Journal entries</h2>
                <p>Save new account records or review saved records.</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>REFERENCE</th>
                    <th>DATE</th>
                    <th>DESCRIPTION</th>
                    <th>LINES</th>
                    <th>DEBIT TOTAL</th>
                    <th>STATUS</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {journals.map((entry) => {
                    const debit = entry.lines.reduce(
                      (sum, line) => sum + Number(line.debit),
                      0,
                    );
                    return (
                      <tr key={entry.id}>
                        <td>
                          <strong>{entry.reference}</strong>
                        </td>
                        <td>{date(entry.postingDate)}</td>
                        <td>{entry.description}</td>
                        <td>
                          {entry.lines
                            .map(
                              (line) =>
                                `${line.account.code} ${line.account.name}`,
                            )
                            .join("; ")}
                        </td>
                        <td>{money(debit, currency)}</td>
                        <td>
                          <span className="inline-flex py-1 px-[7px] rounded text-sm font-normal [text-transform:capitalize] bg-[#edf6ef] text-[#4d805a]">
                            {entry.status.toLowerCase()}
                          </span>
                        </td>
                        <td>
                          {writable(user.role) && entry.status === "DRAFT" && (
                            <button
                              className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                              disabled={busy === entry.id}
                              onClick={() => void postJournal(entry.id)}
                            >
                              Confirm entry
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!journals.length && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No journal entries yet.
              </p>
            )}
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden [margin-top:12px]">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Recent expenses</h2>
                <p>Latest recorded expenses in the business.</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>CATEGORY</th>
                    <th>DESCRIPTION</th>
                    <th>PAYMENT</th>
                    <th>REFERENCE</th>
                    <th>AMOUNT</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.slice(0, 50).map((expense) => (
                    <tr key={expense.id}>
                      <td>{date(expense.incurredAt)}</td>
                      <td>{expense.category}</td>
                      <td>{expense.description}</td>
                      <td>
                        {expense.payment.method
                          .toLowerCase()
                          .replaceAll("_", " ")}
                      </td>
                      <td>{expense.payment.reference}</td>
                      <td>
                        <strong>{money(expense.amount, currency)}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!expenses.length && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No recorded expenses.
              </p>
            )}
          </section>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Accounting</span>
            <span>
              Reports reflect posted entries; operational records may require
              reconciliation.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
