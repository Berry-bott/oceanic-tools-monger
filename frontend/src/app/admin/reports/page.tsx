"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminTableSkeleton } from "@/components/admin-loading-skeleton";
import { adminReportOptions, downloadAdminReport, getAdminReport, type AdminReportPath } from "@/services/reports/reports.service";

type ReportResponse = Record<string, unknown>;
type DataRow = Record<string, unknown>;

const canView = (role?: string) => role === "OWNER" || role === "STAFF";
const today = () => new Date().toLocaleDateString("en-CA");
const titleCase = (value: string) => value.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ").replace(/^\w/, (letter) => letter.toUpperCase());
const sourceLabel = (value: string) => value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const chartDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short" }).format(date);
};

function formatMoney(value: unknown, currency: string) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value ?? "—");
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(amount)}`;
  }
}

function formatCell(value: unknown, key: string, currency: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && /amount|revenue|profit|paid|billed|credit|outstanding|balance|total|cost|value|received|sales|expense|discount|return|loss|cogs/i.test(key)) {
    return formatMoney(value, currency);
  }
  if (typeof value === "number") return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return "Details available in the export";
  return String(value);
}

function SummaryCard({ label, value, currency, detail, money = true }: { label: string; value: unknown; currency: string; detail?: string; money?: boolean }) {
  return (
    <article className="rounded-xl border border-line bg-white p-4">
      <span className="text-sm text-muted">{label}</span>
      <strong className="mt-2 block text-xl font-semibold text-ink">
        {typeof value === "number" ? money ? formatMoney(value, currency) : new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value) : String(value ?? "—")}
      </strong>
      {detail && <p className="mb-0 mt-1 text-xs text-muted">{detail}</p>}
    </article>
  );
}

function ReportTable({ rows, currency, emptyText }: { rows: DataRow[]; currency: string; emptyText: string }) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (!rows.length) return <AdminEmptyState icon="search" title="Nothing to show yet" description={emptyText} />;
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] text-left text-sm">
        <thead className="bg-[#f8faf8]">
          <tr>{columns.map((column) => <th key={column} className="p-3 font-medium text-muted">{titleCase(column)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={String(row.id ?? row.invoiceId ?? row.saleId ?? row.reference ?? index)} className="border-t border-line">
              {columns.map((column) => <td key={column} className="p-3 text-ink">{formatCell(row[column], column, currency)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SalesPerformance({ report, from, to, currency, branchSelected }: { report: DataRow; from: string; to: string; currency: string; branchSelected: boolean }) {
  const daily = Array.isArray(report.byDay) ? report.byDay as DataRow[] : [];
  const topProducts = Array.isArray(report.topProducts) ? report.topProducts as DataRow[] : [];
  const lossProducts = Array.isArray(report.lossProducts) ? report.lossProducts as DataRow[] : [];
  const bestSellerRows = topProducts.map(({ product, sku, quantity, revenue, grossProfit }) => ({ product, sku, quantity, revenue, grossProfit }));
  const lossProductRows = lossProducts.map(({ product, sku, quantity, revenue, costOfGoodsSold, grossProfit, lossMakingSales, lossOnLossMakingSales }) => ({ product, sku, quantity, revenue, costOfGoodsSold, grossProfit, lossMakingSales, lossOnLossMakingSales }));
  const paymentMethods = Array.isArray(report.byPaymentMethod) ? report.byPaymentMethod as DataRow[] : [];
  const channels = Array.isArray(report.byChannel) ? report.byChannel as DataRow[] : [];
  const points = daily.length ? daily : [{ date: from, netSales: 0, grossProfit: 0 }, ...(to !== from ? [{ date: to, netSales: 0, grossProfit: 0 }] : [])];
  const salesMetrics = [
    ["Gross sales", report.grossSales], ["Discounts", report.discounts], ["Returns", report.salesReturns],
    ["Total business revenue", report.netSales], ["Money received", report.cashCollected], ["Gross profit", report.grossProfit], ["Net profit", report.netProfit],
  ] as const;

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sales summary">
        {salesMetrics.map(([label, value]) => <SummaryCard key={label} label={label} value={Number(value ?? 0)} currency={currency} detail={label === "Total business revenue" ? "After discounts and returns" : undefined} />)}
      </section>
      <section className="rounded-xl border border-line bg-white p-4">
        <div className="mb-4">
          <h2 className="m-0 text-base font-semibold">Sales performance</h2>
          <p className="mb-0 mt-1 text-sm text-muted">Daily sales and gross profit for {from} to {to}{branchSelected ? " in the selected branch" : " across all branches"}.</p>
        </div>
        <div className="h-[300px] w-full" role="img" aria-label="Daily sales and gross profit chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 10, right: 12, left: 4, bottom: 2 }}>
              <defs>
                <linearGradient id="reports-sales-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#149e8f" stopOpacity={0.18} /><stop offset="95%" stopColor="#149e8f" stopOpacity={0} /></linearGradient>
                <linearGradient id="reports-profit-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#fca5a5" stopOpacity={0.1} /><stop offset="95%" stopColor="#fca5a5" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e9eeea" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#89958e" }} minTickGap={28} tickFormatter={(value: string) => chartDate(value)} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#89958e" }} tickFormatter={(value: number) => new Intl.NumberFormat("en-NG", { notation: "compact", maximumFractionDigits: 1 }).format(value)} />
              <Tooltip labelFormatter={(value) => chartDate(String(value))} formatter={(value, name) => [formatMoney(value, currency), name]} contentStyle={{ border: "1px solid #e7ece8", borderRadius: 10, fontSize: 12 }} />
              <Area type="monotone" dataKey="netSales" name="Net sales" stroke="#149e8f" strokeWidth={2} fill="url(#reports-sales-fill)" />
              <Area type="monotone" dataKey="grossProfit" name="Gross profit" stroke="#ef9b91" strokeWidth={2} fill="url(#reports-profit-fill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        {!daily.length && <p className="mb-0 text-center text-xs text-muted">No sales in this period yet. The chart is shown at zero.</p>}
      </section>
      <section className="grid gap-4 xl:grid-cols-2">
        <article className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">Best-selling products</h2><p className="mb-0 mt-1 text-sm text-muted">Top products by sales revenue.</p></div>
          <ReportTable rows={bestSellerRows} currency={currency} emptyText="No products sold in this period." />
        </article>
        <article className="rounded-xl border border-line bg-white p-4 sm:p-5">
          <div className="mb-4">
            <h2 className="m-0 text-base font-semibold">Where sales came from</h2>
            <p className="mb-0 mt-1 text-sm text-muted">Compare how customers paid and where sales were recorded.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {([
              { title: "Payment method", caption: "Money received", rows: paymentMethods, key: "method", empty: "No customer payments recorded." },
              { title: "Sales channel", caption: "Sales revenue", rows: channels, key: "channel", empty: "No sales recorded." },
            ] as const).map((group) => {
              const total = group.rows.reduce((sum, row) => sum + Number(row.amount ?? 0), 0);
              const colors = ["bg-[#27805f]", "bg-[#65a989]", "bg-[#a8cbb5]", "bg-[#d0e2d5]"];
              return (
                <section key={group.title} className="min-w-0 rounded-xl border border-[#e7ece8] bg-[#fbfcfb] p-4" aria-label={group.title}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="m-0 text-sm font-semibold text-[#35453b]">{group.title}</h3>
                      <p className="mb-0 mt-1 text-xs text-muted">{group.caption}</p>
                    </div>
                    <strong className="shrink-0 text-sm font-semibold tabular-nums text-[#26372d]">{formatMoney(total, currency)}</strong>
                  </div>
                  {group.rows.length ? (
                    <>
                      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-[#e8eeea]" aria-hidden="true">
                        {group.rows.map((row, index) => <span key={String(row[group.key])} className={`${colors[index % colors.length]} h-full`} style={{ width: `${total > 0 ? Math.max(0, Number(row.amount ?? 0) / total * 100) : 0}%` }} />)}
                      </div>
                      <div className="mt-3 grid gap-2.5">
                        {group.rows.map((row, index) => {
                          const amount = Number(row.amount ?? 0);
                          return (
                            <div key={String(row[group.key])} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm">
                              <span className="flex min-w-0 items-center gap-2 text-[#65736a]">
                                <span className={`size-2 shrink-0 rounded-full ${colors[index % colors.length]}`} aria-hidden="true" />
                                <span className="truncate">{sourceLabel(String(row[group.key] ?? "Other"))}</span>
                              </span>
                              <strong className="text-right font-semibold tabular-nums text-[#35453b]">{formatMoney(amount, currency)}</strong>
                              <span className="col-start-1 text-xs text-[#929d95]">{total > 0 ? `${Math.round(amount / total * 100)}%` : "0%"}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : <p className="mb-0 mt-4 rounded-lg bg-white px-3 py-4 text-sm text-muted">{group.empty}</p>}
                </section>
              );
            })}
          </div>
        </article>
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="border-b border-line p-4">
          <h2 className="m-0 text-base font-semibold">Products with loss-making sales</h2>
          <p className="mb-0 mt-1 text-sm text-muted">Shows products that lost money on at least one sale in this period. Loss amount adds up the loss-making sales; overall gross profit also includes profitable sales of that product.</p>
        </div>
        <ReportTable rows={lossProductRows} currency={currency} emptyText="No products sold below their recorded cost in this period." />
      </section>
    </div>
  );
}

export default function ReportsPage() {
  const user = useCurrentUser();
  const branchesQuery = useBranches<{ id: string; name: string; isDefault?: boolean }>();
  const [path, setPath] = useState<AdminReportPath>("weekly-performance");
  const [from, setFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 29); return date.toLocaleDateString("en-CA"); });
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [branchInitialized, setBranchInitialized] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const option = adminReportOptions.find((item) => item.path === path)!;
  const params = useMemo(() => {
    const query = new URLSearchParams();
    if (option.dated && path === "balance-sheet") query.set("asOf", to);
    else if (option.dated) { query.set("from", from); query.set("to", to); }
    if (option.branch && branchId) query.set("branchId", branchId);
    return query;
  }, [option, path, from, to, branchId]);
  const reportQuery = useQuery({ queryKey: ["admin-report", path, params.toString()], queryFn: () => getAdminReport<ReportResponse>(path, params), enabled: canView(user.data?.user.role) });
  const report = reportQuery.data ?? {};
  const weekly = path === "weekly-performance" && report.data && typeof report.data === "object" && !Array.isArray(report.data) ? report.data as DataRow : {};
  const summary = (report.summary && typeof report.summary === "object" ? report.summary : {}) as DataRow;
  const data = Array.isArray(report.data) ? report.data as DataRow[] : [];
  const currency = String(summary.currency ?? weekly.currency ?? "NGN");

  useEffect(() => {
    const currentUser = user.data?.user;
    const branches = branchesQuery.data?.data ?? [];
    if (branchInitialized || !currentUser || !branches.length) return;
    const initialBranch = currentUser.role === "STAFF"
      ? currentUser.branchId ?? ""
      : branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? "";
    setBranchId(initialBranch);
    setBranchInitialized(true);
  }, [user.data, branchesQuery.data, branchInitialized]);

  async function exportReport(format: "csv" | "xlsx" | "pdf") {
    setExporting(true);
    setExportError("");
    try {
      const result = await downloadAdminReport(path, params, format);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename || `${path}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : "Report could not be downloaded.");
    } finally {
      setExporting(false);
    }
  }

  if (!canView(user.data?.user.role)) return <main className="p-8 text-sm text-muted">Reports are available to owners and staff.</main>;

  return (
    <main className="mx-auto max-w-screen-2xl p-4 py-6 sm:p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs tracking-widest text-brand">BUSINESS REPORTS</p><h1 className="mt-2 text-2xl font-bold">Reports</h1><p className="mt-1 text-sm text-muted">Check sales, profit, customer payments and supplier balances.</p></div>
        <div className="flex gap-2">{(["csv", "xlsx", "pdf"] as const).map((format) => <button key={format} disabled={exporting || reportQuery.isLoading} onClick={() => void exportReport(format)} className="rounded-md border border-line bg-white px-3 py-2 text-sm uppercase hover:bg-canvas disabled:opacity-50">{exporting ? "Preparing..." : format}</button>)}</div>
      </header>

      <section className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">Report<select value={path} onChange={(event) => setPath(event.target.value as AdminReportPath)} className="h-10 rounded-md border border-line px-3">{adminReportOptions.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
        {option.dated && <label className="grid gap-1 text-sm">{path === "balance-sheet" ? "As at" : "From"}<input type="date" value={path === "balance-sheet" ? to : from} onChange={(event) => path === "balance-sheet" ? setTo(event.target.value) : setFrom(event.target.value)} className="h-10 rounded-md border border-line px-3" /></label>}
        {option.dated && path !== "balance-sheet" && <label className="grid gap-1 text-sm">To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-md border border-line px-3" /></label>}
        {option.branch && <label className="grid gap-1 text-sm">Branch<select value={branchId} disabled={user.data?.user.role === "STAFF"} onChange={(event) => setBranchId(event.target.value)} className="h-10 rounded-md border border-line px-3 disabled:bg-canvas">{user.data?.user.role === "OWNER" && <option value="">All branches</option>}{(branchesQuery.data?.data ?? []).filter((branch) => user.data?.user.role !== "STAFF" || branch.id === user.data.user.branchId).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      </section>

      {reportQuery.error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{reportQuery.error.message}</p>}
      {exportError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
      {Boolean(report.basis) && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{String(report.basis)}</p>}
      {Boolean(report.note) && <p className="mb-3 rounded-lg border border-line bg-white p-3 text-sm text-muted">{String(report.note)}</p>}

      {reportQuery.isLoading && <section className="mb-3 overflow-hidden rounded-lg border border-line bg-white"><AdminTableSkeleton columns={4} rows={6} /></section>}

      {path === "weekly-performance" && !reportQuery.isLoading && !reportQuery.error && <SalesPerformance report={weekly} from={from} to={to} currency={currency} branchSelected={Boolean(branchId)} />}

      {path === "profit-loss" && !reportQuery.isLoading && <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Profit and loss summary">
          {[["Revenue", summary.revenue], ["Discounts and returns", summary.contraRevenue], ["Net sales", summary.netSales], ["Cost of goods sold", summary.costOfGoodsSold], ["Gross profit", summary.grossProfit], ["Expenses", summary.expenses], ["Other income", summary.otherIncome], ["Net profit", summary.netProfit]].map(([label, value]) => <SummaryCard key={String(label)} label={String(label)} value={Number(value ?? 0)} currency={currency} />)}
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">Profit and loss details</h2><p className="mb-0 mt-1 text-sm text-muted">Income and costs recorded in the selected period.</p></div><ReportTable rows={data} currency={currency} emptyText="No accounting activity for this period." /></section>
      </>}

      {path === "expenses" && !reportQuery.isLoading && !reportQuery.error && <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Expense summary">
          <SummaryCard label="Total expenses" value={Number(summary.totalExpenses ?? 0)} currency={currency} detail="Recorded by expense date in the selected period" />
          <SummaryCard label="Staff payments" value={Number(summary.staffPayments ?? 0)} currency={currency} />
          <SummaryCard label="Expense records" value={Number(summary.expenseCount ?? 0)} currency={currency} money={false} />
        </section>
        <section className="mb-4 overflow-hidden rounded-xl border border-line bg-white">
          <div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">Expenses by category</h2><p className="mb-0 mt-1 text-sm text-muted">Category totals for {from} to {to}{branchId ? " in the selected branch" : " across all branches"}.</p></div>
          <ReportTable rows={Array.isArray(summary.byCategory) ? summary.byCategory as DataRow[] : []} currency={currency} emptyText="No expenses recorded in this period." />
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div><h2 className="m-0 text-base font-semibold">Expense transactions</h2><p className="mb-0 mt-1 text-sm text-muted">Individual recorded expenses, including staff payments.</p></div>
            <Link href="/admin/expenses" className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">Record an expense</Link>
          </div>
          <ReportTable rows={data} currency={currency} emptyText="No expenses recorded in this period." />
        </section>
      </>}

      {path === "customer-payments" && !reportQuery.isLoading && <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2"><SummaryCard label="Customer payments received" value={Number(summary.totalReceived ?? 0)} currency={currency} /><SummaryCard label="Payments" value={Number(summary.paymentCount ?? 0)} currency={currency} money={false} detail="Successful payments in this period" /></section>
        <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">Customer payment details</h2><p className="mb-0 mt-1 text-sm text-muted">Each row shows the part of a payment applied to a sale.</p></div><ReportTable rows={data} currency={currency} emptyText="No customer payments in this date range." /></section>
      </>}

      {path === "supplier-balances" && !reportQuery.isLoading && <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Supplier bills owed" value={Number(summary.totalOutstanding ?? 0)} currency={currency} />
          <SummaryCard label="Suppliers owed" value={Number(summary.supplierCount ?? 0)} currency={currency} money={false} />
          <SummaryCard label="Paid to suppliers" value={Number(summary.totalPaid ?? 0)} currency={currency} />
          <SummaryCard label="Supplier credits" value={Number(summary.credits ?? 0)} currency={currency} />
        </section>
        <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Not overdue", summary.current], ["1 to 30 days", summary.days1to30], ["31 to 60 days", summary.days31to60], ["61 to 90 days", summary.days61to90], ["Over 90 days", summary.over90]].map(([label, value]) => <SummaryCard key={String(label)} label={String(label)} value={Number(value ?? 0)} currency={currency} />)}</section>
        <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">Supplier balances</h2><p className="mb-0 mt-1 text-sm text-muted">All branches, as of today. Outstanding amounts include supplier credits and successful payments.</p></div><ReportTable rows={data} currency={currency} emptyText="No supplier bills are recorded." /></section>
      </>}

      {path === "stock-operations" && !reportQuery.isLoading && !reportQuery.error && <>
        <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Stock operations summary">
          {[["Product and branch rows", summary.productBranchBalances], ["Low stock", summary.lowStockItems], ["Out of stock", summary.outOfStockItems], ["Transfer differences", summary.transferDifferences], ["Count differences", summary.countDifferences], ["Damaged or quarantined batches", summary.damagedOrQuarantinedBatches], ["Stock movements", summary.movements], ["Batches recorded", summary.batches]].map(([label, value]) => <SummaryCard key={String(label)} label={String(label)} value={Number(value ?? 0)} currency={currency} money={false} />)}
        </section>
        <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">Stock activity and exceptions</h2><p className="mb-0 mt-1 text-sm text-muted">Each row keeps its product unit separate. Export this report to review stock, transfers, counts and batches.</p></div><ReportTable rows={data} currency={currency} emptyText="No stock activity is recorded." /></section>
      </>}

      {!reportQuery.isLoading && path !== "weekly-performance" && path !== "profit-loss" && path !== "expenses" && path !== "customer-payments" && path !== "supplier-balances" && path !== "stock-operations" && <>
        {Object.keys(summary).length > 0 && <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Report summary">{Object.entries(summary).filter(([key, value]) => key !== "currency" && (typeof value === "number" || typeof value === "string")).map(([key, value]) => <SummaryCard key={key} label={titleCase(key)} value={value} currency={currency} />)}</section>}
        {report.totalValue !== undefined && <section className="mb-4 grid gap-3 sm:grid-cols-2"><SummaryCard label="Total value" value={Number(report.totalValue)} currency={currency} /></section>}
        <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line p-4"><h2 className="m-0 text-base font-semibold">{option.label}</h2><p className="mb-0 mt-1 text-sm text-muted">{data.length} rows</p></div><ReportTable rows={data} currency={currency} emptyText="No rows for this report and date range." /></section>
      </>}

      {report.reconciliationDifference !== undefined && <p className="mt-3 text-sm text-muted">Cash flow reconciliation difference: {formatMoney(report.reconciliationDifference, currency)}</p>}
    </main>
  );
}
