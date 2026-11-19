"use client";

import { useState, Fragment } from "react";
import Link from "next/link";
import { ProductSearchableSelect } from "@/components/ui/product-searchable-select";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { useBranchStore } from "@/stores/branch.store";
import { useInventoryOverview } from "@/hooks/queries/use-inventory-overview";
import { useInventoryWorkflow } from "@/hooks/mutations/use-inventory-workflow";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AppErrorModal } from "@/components/app-error-modal";
import { AppSuccessModal } from "@/components/app-success-modal";
import {
  adjustProductStock,
  approveStockCount,
  createStockCount,
  createStockTransfer,
  dispatchStockTransfer,
  postStockCount,
  receiveStockTransferWithLines,
  submitStockCount,
} from "@/services/inventory/inventory.service";

type User = { id: string; name: string; email: string; role: string; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null; branchId?: string | null };
type Branch = { id: string; name: string; isDefault: boolean };
type Product = { id: string; name: string; sku: string; unit?: string };
type Transfer = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  sourceBranch: { name: string };
  destinationBranch: { name: string };
  lines: { id: string; product: Product; quantity: number | string; receivedQuantity?: number | string | null; discrepancyReason?: string | null }[];
};
type Count = {
  id: string;
  reference: string;
  status: string;
  createdAt: string;
  branch: { name: string };
  createdBy: { name: string; email: string };
  approvedBy?: { name: string; email: string } | null;
  postedBy?: { name: string; email: string } | null;
  reason?: string | null;
  lines: {
    product: Product;
    systemQuantity: number | string;
    countedQuantity: number | string;
    variance: number | string;
  }[];
};

const fmt = (value: number | string) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(Number(value));
const date = (value: string) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

export default function InventorySettingsPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const branchesQuery = useBranches<Branch>();
  const productsQuery = useProducts("");
  const branches = branchesQuery.data?.data ?? [];
  const products = productsQuery.data?.data ?? [];
  const branchId = useBranchStore((state) => state.selectedBranchId);
  const inventoryQuery = useInventoryOverview<unknown, unknown, Transfer, Count, unknown>(
    branchId,
    Boolean(user),
  );
  const workflowMutation = useInventoryWorkflow();

  const [busy, setBusy] = useState("");
  const [countLineKeys, setCountLineKeys] = useState([0]);
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [receivingTransferId, setReceivingTransferId] = useState("");
  const [selectedAdjustmentProductId, setSelectedAdjustmentProductId] = useState("");

  const transfers = (inventoryQuery.data?.transfers ?? []) as Transfer[];
  const counts = (inventoryQuery.data?.counts ?? []) as Count[];

  if (!user) return <AdminPageSkeleton />;

  const canManage = user.role === "OWNER" || (user.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");

  async function action(key: string, request: () => Promise<unknown>, successMessage = "Inventory action completed successfully.") {
    setBusy(key);
    setActionError("");
    setNotice("");
    try {
      await workflowMutation.mutateAsync(request);
      setNotice(successMessage);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The inventory action failed.");
    } finally {
      setBusy("");
    }
  }

  async function createTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await action("create-transfer", () =>
      createStockTransfer({
        sourceBranchId: form.get("source"),
        destinationBranchId: form.get("destination"),
        lines: [{ productId: form.get("product"), quantity: Number(form.get("quantity")) }],
      }),
    );
  }

  async function createCount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const productIds = form.getAll("product").map(String);
    const countedQuantities = form.getAll("countedQuantity").map(Number);
    await action("create-count", () =>
      createStockCount({
        branchId: form.get("branch"),
        reason: form.get("reason"),
        lines: productIds.map((productId, index) => ({
          productId,
          countedQuantity: countedQuantities[index],
        })),
      }),
    );
  }

  async function receiveTransfer(event: React.FormEvent<HTMLFormElement>, transfer: Transfer) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const lines = transfer.lines.map((line) => ({
      lineId: line.id,
      receivedQuantity: Number(form.get(`${line.id}-quantity`)),
      discrepancyReason: String(form.get(`${line.id}-reason`) ?? "").trim() || undefined,
    }));
    await action(transfer.id, () => receiveStockTransferWithLines(transfer.id, { lines }));
    setReceivingTransferId("");
  }

  async function createAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const productId = String(formData.get("product"));
    await action(`adjust-${productId}`, () =>
      adjustProductStock(productId, {
        branchId: formData.get("branch"),
        quantity: Number(formData.get("quantity")),
        reason: formData.get("reason"),
      }),
      "Stock adjustment recorded successfully! Ledger entries and inventory balances have been updated."
    );
    form.reset();
    setSelectedAdjustmentProductId("");
  }

  const formClasses =
    "grid gap-3 rounded-lg border border-[#edf1ed] bg-[#fafcfb] p-3 [&>strong]:text-sm [&>strong]:font-semibold [&>strong]:text-[#43544a] [&_input]:h-10 [&_input]:min-w-0 [&_input]:rounded-md [&_input]:border [&_input]:border-[#dce5de] [&_input]:bg-white [&_input]:px-3 [&_input]:text-sm [&_input]:text-[#45564b] [&_input]:outline-none [&_input]:placeholder:text-[#9aa69e] [&_input:focus]:border-[#8aab91] [&_input:focus]:ring-2 [&_input:focus]:ring-[#e5efe7] [&_select]:h-10 [&_select]:min-w-0 [&_select]:rounded-md [&_select]:border [&_select]:border-[#dce5de] [&_select]:bg-white [&_select]:px-3 [&_select]:text-sm [&_select]:text-[#45564b] [&_select:focus]:border-[#8aab91]";

  const sectionClasses =
    "min-w-0 rounded-xl border border-[#e5ebe6] bg-white p-4 shadow-[0_2px_8px_rgba(32,52,40,0.04)] min-[1500px]:p-5 max-[620px]:p-3 [&_select]:[font:inherit] [&_input]:[font:inherit]";

  const sectionHeadClasses =
    "mb-4 flex items-start justify-between gap-3 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-[-.2px] [&_p]:mt-1 [&_p]:text-sm [&_p]:text-[#87948b]";

  const btnPrimary =
    "h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]";

  const btnSecondary =
    "h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]";

  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">

          {/* Page header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">STOCK CONTROL</span>
              <h1 className="text-[25px] leading-[1.2] m-0 tracking-tight font-bold text-[#1a2a22]">Stock Settings</h1>
              <p className="mt-1 text-sm text-[#87948b]">Manage workflows, transfers, counts, and stock adjustments.</p>
            </div>
            <Link
              href={user?.role === "STAFF" ? "/staff/inventory" : "/admin/inventory"}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-[#e0e7e1] text-[#4e5e54] rounded-lg text-sm font-medium hover:bg-[#f8faf8] transition-colors"
            >
              ← Back to Inventory
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* ── Stock Counts (create form) ── */}
            <section className={sectionClasses}>
              <div className={sectionHeadClasses}>
                <div>
                  <h2>Stock counts</h2>
                  <p>Send a stock check for approval, then save the approved count.</p>
                </div>
              </div>
              {canManage ? (
                <form className={formClasses} onSubmit={(event) => void createCount(event)}>
                  <select name="branch" required defaultValue={branchId}>
                    <option value="" disabled>Select branch</option>
                    {branches.map((b) => (
                      <option value={b.id} key={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <div className="grid gap-2">
                    {countLineKeys.map((key, index) => (
                      <div key={key} className="grid grid-cols-[minmax(0,1fr)_130px_auto] gap-2 max-[620px]:grid-cols-1">
                        <select name="product" required defaultValue="">
                          <option value="" disabled>Product {index + 1}</option>
                          {products.map((p) => <option value={p.id} key={p.id}>{p.name} {p.sku}</option>)}
                        </select>
                        <input
                          name="countedQuantity"
                          type="number"
                          min="0"
                          step="0.01"
                          required
                          placeholder="Physical count"
                          aria-label={`Physical count for product ${index + 1}`}
                        />
                        {countLineKeys.length > 1 && (
                          <button
                            type="button"
                            className="grid size-8 cursor-pointer place-items-center rounded-md border border-line bg-white text-muted hover:bg-canvas"
                            aria-label={`Remove product ${index + 1} from count`}
                            onClick={() => setCountLineKeys((keys) => keys.filter((item) => item !== key))}
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button
                      type="button"
                      className="w-fit cursor-pointer text-sm font-medium text-brand hover:underline"
                      onClick={() => setCountLineKeys((keys) => [...keys, Math.max(...keys) + 1])}
                    >
                      + Add another product
                    </button>
                  </div>
                  <input name="reason" placeholder="Count note (optional)" maxLength={500} />
                  <button
                    className="h-10 rounded-lg border border-brand bg-brand px-3 text-sm font-medium text-white shadow-[0_1px_2px_rgba(24,63,51,0.1)] transition-colors hover:bg-brand-dark disabled:opacity-60"
                    disabled={busy === "create-count"}
                  >
                    {busy === "create-count" ? "Saving…" : "Create count"}
                  </button>
                </form>
              ) : (
                <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                  You can view stock, but only the owner or stock manager can change it.
                </p>
              )}
            </section>

            {/* ── Stock Workflows (new transfer form) ── */}
            <section className={sectionClasses}>
              <div className={sectionHeadClasses}>
                <div>
                  <h2>Stock workflows</h2>
                  <p>You need owner or stock manager access to do this.</p>
                </div>
              </div>
              {canManage ? (
                <form className={formClasses} onSubmit={(event) => void createTransfer(event)}>
                  <strong>New transfer</strong>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <select name="source" required aria-label="Source branch">
                      <option value="">From branch</option>
                      {branches.map((b) => (
                        <option value={b.id} key={b.id}>{b.name}</option>
                      ))}
                    </select>
                    <select name="destination" required aria-label="Destination branch">
                      <option value="">To branch</option>
                      {branches.map((b) => (
                        <option value={b.id} key={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <select name="product" required defaultValue="">
                    <option value="" disabled>Select product</option>
                    {products.map((p) => (
                      <option value={p.id} key={p.id}>{p.name} {p.sku}</option>
                    ))}
                  </select>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <input name="quantity" type="number" min="0.01" step="0.01" required placeholder="Quantity" />
                    <button className={btnPrimary} disabled={busy === "create-transfer"}>
                      {busy === "create-transfer" ? "Creating…" : "Create transfer"}
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                  You can view stock, but only the owner or stock manager can change it.
                </p>
              )}
            </section>

            {/* ── Adjust Stock ── */}
            <section className={sectionClasses}>
              <div className={sectionHeadClasses}>
                <div>
                  <h2>Adjust stock</h2>
                  <p>Add or remove stock and say why.</p>
                </div>
              </div>
              {canManage ? (
                <form className={formClasses} onSubmit={(event) => void createAdjustment(event)}>
                  <select name="branch" required defaultValue={branchId}>
                    <option value="" disabled>Select branch</option>
                    {branches.map((b) => (
                      <option value={b.id} key={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <ProductSearchableSelect
                    products={products}
                    selectedProductId={selectedAdjustmentProductId}
                    onSelect={(id) => setSelectedAdjustmentProductId(id)}
                    placeholder="Select product to adjust..."
                  />
                  <input type="hidden" name="product" value={selectedAdjustmentProductId} />
                  {selectedAdjustmentProductId && (
                    <div className="rounded-md bg-canvas p-3 text-sm text-muted">
                      Current system stock for {products.find(p => p.id === selectedAdjustmentProductId)?.name}:{" "}
                      <strong>{(inventoryQuery.data as any)?.summary?.data?.filter((l: any) => l.productId === selectedAdjustmentProductId).reduce((sum: number, l: any) => sum + Number(l.onHand), 0) ?? 0}</strong>
                    </div>
                  )}
                  <input name="quantity" type="number" step="0.01" required placeholder="Positive gain (e.g. 10), negative loss (e.g. -2)" />
                  <input name="reason" required minLength={3} maxLength={500} placeholder="Reason for adjustment" />
                  <button className={btnPrimary} disabled={!!busy}>
                    Confirm stock adjustment
                  </button>
                </form>
              ) : (
                <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                  Stock adjustments are restricted to inventory managers and owners.
                </p>
              )}
            </section>

            {/* ── Branch Transfers (list) ── */}
            <section className="min-w-0 bg-white border border-line rounded-xl shadow-[0_1px_2px_#24333704] overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-[#edf1ed] px-5 py-4 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:px-4">
                <div>
                  <h2 className="m-0 text-base font-semibold text-ink tracking-[-0.2px]">Branch transfers</h2>
                  <p className="mb-0 mt-1 text-sm text-[#87948b]">Dispatch drafts and receive in-transit stock.</p>
                </div>
              </div>
              <div className="py-[3px] px-[15px]">
                {transfers.map((transfer) => (
                  <Fragment key={transfer.id}>
                    <article className="min-h-[59px] flex items-center gap-2 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>div]:grid [&>div]:gap-1 [&>div]:min-w-0 [&>div]:[flex:1] [&>div_strong]:text-sm [&>div_strong]:text-[#3c4d42] [&>div_small]:text-sm [&>div_small]:text-[#909c94] [&>div_small]:leading-[1.4] max-[620px]:[flex-wrap:wrap] max-[620px]:py-2 max-[620px]:[&>div]:[flex-basis:100%]">
                      <div>
                        <strong>{transfer.reference}</strong>
                        <small>
                          {transfer.sourceBranch.name} → {transfer.destinationBranch.name}{" "}
                          {transfer.lines.map((line) => `${line.product.name} ${fmt(line.quantity)}`).join(", ")}
                        </small>
                      </div>
                      <span className={statusPill(transfer.status.toLowerCase())}>
                        {transfer.status.toLowerCase().replaceAll("_", " ")}
                      </span>
                      {canManage && transfer.status === "DRAFT" && (
                        <button
                          className={btnSecondary}
                          disabled={busy === transfer.id}
                          onClick={() => void action(transfer.id, () => dispatchStockTransfer(transfer.id))}
                        >
                          Dispatch
                        </button>
                      )}
                      {canManage && transfer.status === "IN_TRANSIT" && (
                        <button
                          type="button"
                          className={btnPrimary}
                          onClick={() => setReceivingTransferId((current) => current === transfer.id ? "" : transfer.id)}
                        >
                          {receivingTransferId === transfer.id ? "Close receipt" : "Record items received"}
                        </button>
                      )}
                    </article>
                    {canManage && transfer.status === "IN_TRANSIT" && receivingTransferId === transfer.id && (
                      <form
                        className="grid gap-3 border-b border-line bg-canvas p-4"
                        onSubmit={(event) => void receiveTransfer(event, transfer)}
                      >
                        <strong className="text-sm font-semibold text-ink">Check each item received</strong>
                        {transfer.lines.map((line) => (
                          <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_140px_minmax(180px,1fr)] items-center gap-2 max-[700px]:grid-cols-1">
                            <label className="text-xs text-ink">{line.product.name} · sent {fmt(line.quantity)} {line.product.unit}</label>
                            <input
                              name={`${line.id}-quantity`}
                              type="number"
                              min="0"
                              step="0.001"
                              required
                              defaultValue={line.quantity as number}
                              aria-label={`Quantity received for ${line.product.name}`}
                              className="h-9 rounded-md border border-line bg-white px-2 text-sm"
                            />
                            <input
                              name={`${line.id}-reason`}
                              maxLength={500}
                              placeholder="Explain any difference"
                              aria-label={`Reason for quantity difference for ${line.product.name}`}
                              className="h-9 rounded-md border border-line bg-white px-2 text-sm"
                            />
                          </div>
                        ))}
                        <button className="button-primary w-fit" disabled={busy === transfer.id}>
                          {busy === transfer.id ? "Saving…" : "Confirm received quantities"}
                        </button>
                      </form>
                    )}
                  </Fragment>
                ))}
                {!transfers.length && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">No stock transfers yet.</p>
                )}
              </div>
            </section>

            {/* ── Stock counts list (approve / post) ── */}
            <section className="min-w-0 bg-white border border-line rounded-xl shadow-[0_1px_2px_#24333704] overflow-hidden">
              <div className="flex items-center justify-between gap-4 border-b border-[#edf1ed] px-5 py-4 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:px-4">
                <div>
                  <h2 className="m-0 text-base font-semibold text-ink tracking-[-0.2px]">Stock counts</h2>
                  <p className="mb-0 mt-1 text-sm text-[#87948b]">
                    Send a stock check for approval, then save the approved count.
                  </p>
                </div>
              </div>
              <div className="py-[3px] px-[15px]">
                {counts.map((count) => (
                  <article
                    className="min-h-[59px] flex items-center gap-2 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>div]:grid [&>div]:gap-1 [&>div]:min-w-0 [&>div]:[flex:1] [&>div_strong]:text-sm [&>div_strong]:text-[#3c4d42] [&>div_small]:text-sm [&>div_small]:text-[#909c94] [&>div_small]:leading-[1.4] max-[620px]:[flex-wrap:wrap] max-[620px]:py-2 max-[620px]:[&>div]:[flex-basis:100%]"
                    key={count.id}
                  >
                    <div>
                      <strong>{count.reference}</strong>
                      <small>
                        {count.branch.name} · {count.lines.length} products · started by {count.createdBy.name} · {date(count.createdAt)}
                      </small>
                      <small>
                        {count.approvedBy ? `Approved by ${count.approvedBy.name}` : "Waiting for approval"}
                        {count.postedBy ? ` · Confirmed by ${count.postedBy.name}` : ""}
                      </small>
                    </div>
                    <details className="relative text-xs">
                      <summary className="cursor-pointer whitespace-nowrap text-brand">Review count</summary>
                      <div className="absolute right-0 z-10 mt-2 max-h-64 w-80 overflow-auto rounded-lg border border-line bg-white p-3 shadow-lg">
                        {count.lines.map((line) => (
                          <div key={line.product.sku} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-b border-line py-2 last:border-0">
                            <strong className="font-medium text-ink">{line.product.name}</strong>
                            <span className={Number(line.variance) === 0 ? "text-[#397853]" : "text-[#ad5b4d]"}>
                              {Number(line.variance) > 0 ? "+" : ""}{fmt(line.variance)} {line.product.unit}
                            </span>
                            <small className="col-span-2 text-muted">
                              System {fmt(line.systemQuantity)} · Counted {fmt(line.countedQuantity)} {line.product.unit}
                            </small>
                          </div>
                        ))}
                      </div>
                    </details>
                    <span className={statusPill(count.status.toLowerCase())}>{count.status.toLowerCase()}</span>
                    {canManage && count.status === "DRAFT" && (
                      <button
                        className={btnSecondary}
                        disabled={busy === count.id}
                        onClick={() => void action(count.id, () => submitStockCount(count.id))}
                      >
                        Send for approval
                      </button>
                    )}
                    {(user.role === "OWNER" || user.role === "STAFF") && count.status === "SUBMITTED" && (
                      <button
                        className={btnSecondary}
                        disabled={busy === count.id}
                        onClick={() => void action(count.id, () => approveStockCount(count.id))}
                      >
                        Approve
                      </button>
                    )}
                    {(user.role === "OWNER" || user.role === "STAFF") && count.status === "APPROVED" && (
                      <button
                        className={btnPrimary}
                        disabled={busy === count.id}
                        onClick={() => void action(count.id, () => postStockCount(count.id))}
                      >
                        Confirm entry
                      </button>
                    )}
                  </article>
                ))}
                {!counts.length && (
                  <AdminEmptyState
                    icon="box"
                    title="No stock counts yet"
                    description="Start a count when you are ready to compare shelf quantities with the system."
                  />
                )}
              </div>
            </section>
          </div>
        </div>
        <AppSuccessModal message={notice} onClose={() => setNotice("")} title="Stock Action Completed" />
        <AppErrorModal message={actionError} onClose={() => setActionError("")} title="Stock action could not be completed" />
      </main>
    </div>
  );
}
