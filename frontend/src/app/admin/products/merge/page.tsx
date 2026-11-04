"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useProducts } from "@/hooks/queries/use-products";
import { mergeProducts, productKeys } from "@/services/products/product.service";

export default function MergeProductsPage() {
  const user = useCurrentUser();
  const productsQuery = useProducts("");
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (user.data?.user.role !== "OWNER") return <main className="p-8 text-sm text-muted">Only the business owner can merge products.</main>;
  const products = (productsQuery.data?.data ?? []).filter((product) => product.state !== "ARCHIVED");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget); setBusy(true); setError(""); setMessage("");
    try { await mergeProducts({ sourceProductId: String(form.get("source")), targetProductId: String(form.get("target")), reason: String(form.get("reason")) }); setMessage("Products merged. Source stock and history were moved according to the backend merge rules."); await Promise.all([client.invalidateQueries({ queryKey: productKeys.all }), invalidateAdminSummaries(client)]); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Products could not be merged."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto max-w-3xl p-4 py-8 sm:p-8"><Link href="/admin/products" className="text-sm text-brand">Products / Merge</Link><h1 className="mt-3 text-2xl font-bold">Merge duplicate products</h1><p className="mb-6 mt-2 text-sm text-muted">Choose the duplicate to retire and the product that will remain. Active reservations must be cleared first.</p><form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-xl border border-line bg-white p-5"><label className="grid gap-1 text-sm">Duplicate product<select name="source" required className="h-10 rounded-md border border-line px-3"><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label><label className="grid gap-1 text-sm">Keep this product<select name="target" required className="h-10 rounded-md border border-line px-3"><option value="">Choose product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.sku}</option>)}</select></label><label className="grid gap-1 text-sm">Why are you merging these? (at least 5 characters)<textarea name="reason" required minLength={5} maxLength={500} rows={3} className="rounded-md border border-line p-3" /></label><p className="m-0 text-xs text-muted">This action moves available stock and batch lots, updates the remaining product cost, and archives the duplicate. It cannot be undone from this page.</p>{error && <p role="alert" className="text-sm text-red-700">{error}</p>}{message && <p role="status" className="text-sm text-green-800">{message}</p>}<div className="flex justify-end gap-2"><Link href="/admin/products" className="rounded-md border border-line px-4 py-2 text-sm">Back</Link><button disabled={busy} className="rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? "Merging..." : "Merge products"}</button></div></form></main>;
}
