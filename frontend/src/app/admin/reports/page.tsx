"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { adminReportOptions, downloadAdminReport, getAdminReport, type AdminReportPath } from "@/services/reports/reports.service";

type ReportResponse = Record<string, unknown>;
const canView = (role?: string) => role === "OWNER" || role === "STAFF";
const today = () => new Date().toLocaleDateString("en-CA");
const readable = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

export default function ReportsPage() {
  const user = useCurrentUser();
  const branchesQuery = useBranches<{ id: string; name: string }>();
  const [path, setPath] = useState<AdminReportPath>("profit-loss");
  const [from, setFrom] = useState(() => { const date = new Date(); date.setDate(date.getDate() - 29); return date.toLocaleDateString("en-CA"); });
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState("");
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
  const summary = (report.summary && typeof report.summary === "object" ? report.summary : {}) as Record<string, unknown>;
  const data = Array.isArray(report.data) ? report.data as Record<string, unknown>[] : [];
  const columns = [...new Set(data.flatMap((row) => Object.keys(row)))];

  async function exportReport(format: "csv" | "xlsx" | "pdf") {
    setExporting(true); setExportError("");
    try {
      const result = await downloadAdminReport(path, params, format);
      const url = URL.createObjectURL(result.blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = result.filename || `${path}.${format}`; anchor.click(); URL.revokeObjectURL(url);
    } catch (cause) { setExportError(cause instanceof Error ? cause.message : "Report could not be downloaded."); }
    finally { setExporting(false); }
  }

  if (!canView(user.data?.user.role)) return <main className="p-8 text-sm text-muted">Reports are available to owners, accountants, and auditors.</main>;

  return (
    <main className="mx-auto max-w-screen-2xl p-4 py-6 sm:p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs tracking-widest text-brand">BUSINESS REPORTS</p><h1 className="mt-2 text-2xl font-bold">Reports</h1><p className="mt-1 text-sm text-muted">Review sales, money, stock, tax and supplier activity.</p></div><div className="flex gap-2">{(["csv", "xlsx", "pdf"] as const).map((format) => <button key={format} disabled={exporting || reportQuery.isLoading} onClick={() => void exportReport(format)} className="rounded-md border border-line bg-white px-3 py-2 text-sm uppercase disabled:opacity-50">{exporting ? "Preparing..." : format}</button>)}</div></header>
      <section className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="grid gap-1 text-sm">Report<select value={path} onChange={(event) => setPath(event.target.value as AdminReportPath)} className="h-10 rounded-md border border-line px-3">{adminReportOptions.map((item) => <option key={item.path} value={item.path}>{item.label}</option>)}</select></label>
        {option.dated && <label className="grid gap-1 text-sm">{path === "balance-sheet" ? "As at" : "From"}<input type="date" value={path === "balance-sheet" ? to : from} onChange={(event) => path === "balance-sheet" ? setTo(event.target.value) : setFrom(event.target.value)} className="h-10 rounded-md border border-line px-3" /></label>}
        {option.dated && path !== "balance-sheet" && <label className="grid gap-1 text-sm">To<input type="date" value={to} min={from} onChange={(event) => setTo(event.target.value)} className="h-10 rounded-md border border-line px-3" /></label>}
        {option.branch && <label className="grid gap-1 text-sm">Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-10 rounded-md border border-line px-3"><option value="">All branches</option>{(branchesQuery.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>}
      </section>
      {reportQuery.error && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{reportQuery.error.message}</p>}
      {exportError && <p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{exportError}</p>}
      {Boolean(report.basis) && <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{readable(report.basis)}</p>}
      {Boolean(report.note) && <p className="mb-3 rounded-lg border border-line bg-white p-3 text-sm text-muted">{readable(report.note)}</p>}
      <section className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Report summary">
        {Object.entries(summary).filter(([, value]) => typeof value === "number" || typeof value === "string").map(([key, value]) => <article key={key} className="rounded-xl border border-line bg-white p-4"><span className="text-sm capitalize text-muted">{key.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</span><strong className="mt-2 block text-xl font-semibold">{readable(value)}</strong></article>)}
        {!Object.keys(summary).length && report.totalValue !== undefined && <article className="rounded-xl border border-line bg-white p-4"><span className="text-sm text-muted">Total value</span><strong className="mt-2 block text-xl">{readable(report.totalValue)}</strong></article>}
      </section>
      <section className="overflow-hidden rounded-xl border border-line bg-white"><div className="border-b border-line p-4"><h2 className="m-0 text-lg font-semibold">{option.label}</h2><p className="mb-0 mt-1 text-sm text-muted">{reportQuery.isLoading ? "Loading report..." : `${data.length} rows`}</p></div>{data.length && columns.length ? <div className="overflow-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#f8faf8]"><tr>{columns.map((column) => <th key={column} className="p-3 font-medium capitalize">{column.replaceAll(/([A-Z])/g, " $1").replaceAll("_", " ")}</th>)}</tr></thead><tbody>{data.map((row, index) => <tr key={String(row.id ?? row.reference ?? row.code ?? index)} className="border-t border-line">{columns.map((column) => <td key={column} className="p-3">{readable(row[column])}</td>)}</tr>)}</tbody></table></div> : !reportQuery.isLoading && !reportQuery.error ? <p className="p-8 text-center text-sm text-muted">No rows for this report and date range.</p> : null}</section>
      {report.reconciliationDifference !== undefined && <p className="mt-3 text-sm text-muted">Cash flow reconciliation difference: {readable(report.reconciliationDifference)}</p>}
    </main>
  );
}
