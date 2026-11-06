"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import {
  createSaleReturn,
  lookupSaleForReturn,
  salesKeys,
} from "@/services/sales/sales.service";

type ReturnableLine = {
  id: string;
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
  returns: { quantity: number | string }[];
};

type ReturnableSale = {
  id: string;
  number: string;
  createdAt: string;
  status: string;
  total: number | string;
  branch: { name: string };
  user: { name: string; email: string };
  customer?: { name: string; phone?: string | null } | null;
  lines: ReturnableLine[];
  payments: { payment: { status: string; amount: number | string; method: string } }[];
};

type ReturnResult = {
  data: {
    return: { id: string; reference: string; total: number | string };
    refund: { reference: string; amount: number | string; status: string } | null;
  };
};

const money = (amount: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2,
  }).format(amount);

const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function SalesReturnsPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as { role?: string } | undefined;
  const queryClient = useQueryClient();
  const [reference, setReference] = useState("");
  const [sale, setSale] = useState<ReturnableSale | null>(null);
  const [selected, setSelected] = useState<Record<string, { quantity: number; restock: boolean }>>({});
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState("CASH");
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const initialReference = new URLSearchParams(window.location.search).get("reference");
    if (initialReference) {
      setReference(initialReference);
      void findSale(initialReference);
    }
  }, []);

  async function findSale(value: string) {
    const cleaned = value.trim();
    if (!cleaned) {
      setError("Enter the sale or receipt reference first.");
      return;
    }

    setSearching(true);
    setError("");
    setMessage("");
    setSale(null);
    setSelected({});
    try {
      const result = await lookupSaleForReturn<ReturnableSale>(cleaned);
      setSale(result.data);
      setReference(result.data.number);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "That sale could not be found.");
    } finally {
      setSearching(false);
    }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sale) return;
    const lines = Object.entries(selected)
      .filter(([, item]) => item.quantity > 0)
      .map(([saleLineId, item]) => ({ saleLineId, quantity: item.quantity, restock: item.restock }));

    if (!lines.length) {
      setError("Choose at least one item and enter the quantity being returned.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await createSaleReturn<ReturnResult>(sale.id, {
        reason,
        method,
        lines,
      });
      const refund = result.data.refund;
      setMessage(
        refund
          ? `Return ${result.data.return.reference} recorded. Refund ${money(Number(refund.amount))} issued by ${method.toLowerCase().replaceAll("_", " ")}. Refund reference: ${refund.reference}.`
          : `Return ${result.data.return.reference} recorded. No money was paid on the original sale, so the return was added to the customer's balance.`,
      );
      setSelected({});
      setReason("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        invalidateAdminSummaries(queryClient),
      ]);
      const refreshed = await lookupSaleForReturn<ReturnableSale>(sale.number);
      setSale(refreshed.data);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The return could not be recorded.");
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return <AdminPageSkeleton variant="form" />;
  }

  return (
    <main className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/admin/sales" className="text-sm text-brand hover:underline">Sales</Link>
          <p className="mb-2 mt-4 text-xs font-semibold tracking-widest text-brand">SALES</p>
          <h1 className="m-0 text-2xl font-bold text-ink">Return items</h1>
          <p className="mb-0 mt-2 text-sm text-muted">Find the original sale, select what came back, and record the refund.</p>
        </div>
      </div>

      <form onSubmit={(event) => { event.preventDefault(); void findSale(reference); }} className="mb-4 grid gap-3 rounded-xl border border-line bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm text-ink">
          Sale or receipt reference
          <input
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="e.g. SALE-20261105-AB12CD34"
            className="h-10 rounded-lg border border-line px-3 text-sm outline-none focus:border-brand"
            required
          />
        </label>
        <button type="submit" disabled={searching} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
          {searching ? "Searching..." : "Find sale"}
        </button>
      </form>

      {error && <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {message && <p role="status" className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">{message}</p>}

      {sale && (
        <>
          <section className="mb-4 grid gap-4 rounded-xl border border-line bg-white p-5 sm:grid-cols-2 lg:grid-cols-4">
            <div><span className="block text-xs text-muted">Sale reference</span><strong className="mt-1 block text-sm text-ink">{sale.number}</strong></div>
            <div><span className="block text-xs text-muted">Sold by</span><strong className="mt-1 block text-sm text-ink">{sale.user.name}</strong><small className="block text-xs text-muted">{sale.user.email}</small></div>
            <div><span className="block text-xs text-muted">Customer</span><strong className="mt-1 block text-sm text-ink">{sale.customer?.name ?? "Walk-in customer"}</strong>{sale.customer?.phone && <small className="block text-xs text-muted">{sale.customer.phone}</small>}</div>
            <div><span className="block text-xs text-muted">Shop and sale time</span><strong className="mt-1 block text-sm text-ink">{sale.branch.name}</strong><small className="block text-xs text-muted">{dateTime(sale.createdAt)}</small></div>
          </section>

          <form onSubmit={(event) => void submitReturn(event)} className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="border-b border-line p-4">
              <h2 className="m-0 text-base font-semibold text-ink">Items on this sale</h2>
              <p className="mb-0 mt-1 text-sm text-muted">Enter only the quantity the customer brought back. You can return part of an item or the full amount.</p>
            </div>
            <div className="divide-y divide-line">
              {sale.lines.map((line) => {
                const sold = Number(line.quantity);
                const alreadyReturned = line.returns.reduce((sum, item) => sum + Number(item.quantity), 0);
                const remaining = Math.max(0, sold - alreadyReturned);
                const selection = selected[line.id] ?? { quantity: 0, restock: true };
                return (
                  <article key={line.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_150px_170px] sm:items-center">
                    <div className="min-w-0">
                      <strong className="block text-sm text-ink">{line.productName}</strong>
                      <small className="mt-1 block text-xs text-muted">SKU {line.sku} | Sold {sold} | Returned before {alreadyReturned} | Still returnable {remaining}</small>
                      <small className="mt-1 block text-xs text-muted">Sale price {money(Number(line.unitPrice))} each</small>
                    </div>
                    <label className="grid gap-1 text-xs text-muted">
                      Return quantity
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        step="0.01"
                        value={selection.quantity}
                        disabled={remaining <= 0}
                        onChange={(event) => setSelected((current) => ({ ...current, [line.id]: { ...selection, quantity: Number(event.target.value) } }))}
                        className="h-9 rounded-md border border-line px-2 text-sm text-ink disabled:bg-canvas"
                      />
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        checked={selection.restock}
                        disabled={remaining <= 0 || selection.quantity <= 0}
                        onChange={(event) => setSelected((current) => ({ ...current, [line.id]: { ...selection, restock: event.target.checked } }))}
                        className="size-4 accent-brand"
                      />
                      Add good items back to stock
                    </label>
                  </article>
                );
              })}
            </div>

            <div className="grid gap-4 border-t border-line bg-[#fafbfa] p-4 sm:grid-cols-2">
              <label className="grid gap-1.5 text-sm text-ink">Why is the customer returning the item?
                <input value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} maxLength={500} required placeholder="e.g. Wrong size" className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand" />
              </label>
              <label className="grid gap-1.5 text-sm text-ink">How did you return the money?
                <select value={method} onChange={(event) => setMethod(event.target.value)} className="h-10 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand">
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="OTHER">Other method</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4">
              <p className="m-0 max-w-2xl text-xs leading-relaxed text-muted">The system calculates the refund from the original sale price, any sale discount, and the amount the customer already paid. The original sale and cashier details remain in the records.</p>
              <button type="submit" disabled={saving || sale.status === "RETURNED"} className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
                {saving ? "Recording return..." : "Record return and refund"}
              </button>
            </div>
          </form>
        </>
      )}
    </main>
  );
}
