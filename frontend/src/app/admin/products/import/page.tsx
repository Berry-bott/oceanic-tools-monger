"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { useBranches } from "@/hooks/queries/use-branches";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { commitProductImport, parseProductImport, productKeys, validateProductImport } from "@/services/products/product.service";

type ImportRow = Record<string, unknown>;
type Validation = { branchId: string; total: number; valid: number; invalid: number; rows: { row: number; status: string; errors: string[]; possibleMatch?: { name: string; sku: string } }[] };
const canManage = (user?: { role: string; staffAccessRole?: string | null }) => user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");

export default function ProductImportPage() {
  const userQuery = useCurrentUser();
  const branchesQuery = useBranches<{ id: string; name: string }>();
  const client = useQueryClient();
  const [branchId, setBranchId] = useState("");
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [validation, setValidation] = useState<Validation>();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function readFile(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setMessage(""); setValidation(undefined);
    try {
      const parsed = await parseProductImport(file);
      setRows(parsed.data.rows);
      const checked = await validateProductImport(parsed.data.rows, branchId || undefined);
      setValidation(checked.data);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The file could not be checked."); }
    finally { setBusy(false); }
  }

  async function commit() {
    if (!validation || validation.invalid || !validation.valid) return;
    setBusy(true); setError("");
    try {
      const result = await commitProductImport(rows, validation.branchId);
      setMessage(`${result.data.created} products imported. Opening stock value: ${Number(result.data.openingStockValue).toLocaleString("en-NG", { style: "currency", currency: "NGN" })}.`);
      setRows([]); setValidation(undefined);
      await client.invalidateQueries({ queryKey: productKeys.all });
      await invalidateAdminSummaries(client);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Products could not be imported."); }
    finally { setBusy(false); }
  }

  if (userQuery.isPending) return <AdminPageSkeleton variant="form" />;
  if (!userQuery.data || !canManage(userQuery.data.user)) return <main className="p-8 text-sm text-muted">You do not have access to import products.</main>;
  const branches = branchesQuery.data?.data ?? [];

  return (
    <main className="mx-auto max-w-5xl p-4 py-8 sm:p-8">
      <Link href="/admin/products" className="text-sm text-brand">Products / Import</Link>
      <h1 className="mt-3 text-2xl font-bold">Import products</h1>
      <p className="mb-6 mt-2 text-sm text-muted">Upload a CSV or Excel file. We’ll check the rows before saving anything.</p>
      <section className="grid gap-4 rounded-xl border border-line bg-white p-5">
        <p className="m-0 text-sm text-muted">Required columns: <strong>sku, name, category, sellingPrice, quantity</strong>. Create the category and subcategory first. Quantity can be 0. Optional: barcode, description, subcategory, unit, costPrice, reorderLevel, duplicateOverrideReason. Files can include up to 5,000 rows. Imported products appear on your website after import.</p>
        <label className="grid max-w-md gap-2 text-sm">Branch for opening stock<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="h-10 rounded-md border border-line px-3"><option value="">Default branch</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        <label className="grid max-w-md gap-2 text-sm">Choose CSV or XLSX file<input type="file" accept=".csv,.xlsx" disabled={busy} onChange={(event) => void readFile(event.target.files?.[0])} className="rounded-md border border-line p-2" /></label>
        {busy && <p role="status" className="text-sm text-muted">Checking file...</p>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {message && <p role="status" className="text-sm text-green-800">{message}</p>}
      </section>
      {validation && <section className="mt-5 overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4"><div><h2 className="m-0 text-lg font-bold">Review rows</h2><p className="mb-0 mt-1 text-sm text-muted">{validation.valid} ready · {validation.invalid} need fixing · {validation.total} total</p></div><button disabled={busy || validation.invalid > 0 || validation.valid === 0} onClick={() => void commit()} className="rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Importing..." : "Import products"}</button></div>
        <div className="max-h-[28rem] overflow-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="sticky top-0 bg-[#f8faf8]"><tr><th className="p-3">Row</th><th className="p-3">SKU</th><th className="p-3">Product</th><th className="p-3">Check</th><th className="p-3">Details</th></tr></thead><tbody>{validation.rows.map((check, index) => <tr key={check.row} className="border-t border-line"><td className="p-3">{check.row}</td><td className="p-3">{String(rows[index]?.sku ?? "")}</td><td className="p-3">{String(rows[index]?.name ?? "")}</td><td className="p-3">{check.status === "invalid" ? "Fix needed" : check.status === "warning-overridden" ? "Override noted" : "Ready"}</td><td className="p-3">{check.errors.join(" ") || (check.possibleMatch ? `Similar to ${check.possibleMatch.name} (${check.possibleMatch.sku}).` : "—")}</td></tr>)}</tbody></table></div>
      </section>}
    </main>
  );
}
