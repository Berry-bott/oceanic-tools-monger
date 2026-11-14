"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useBusiness } from "@/hooks/queries/use-business";
import { useOnlineOrders } from "@/hooks/queries/use-online-orders";
import { useReceivePickupPayment, useTransitionOnlineOrder } from "@/hooks/mutations/use-order-mutations";
import { useBranchStore } from "@/stores/branch.store";
import { AdminPageSkeleton, AdminTableSkeleton } from "@/components/admin-loading-skeleton";

type User = { id: string; name: string; email: string; role: string };
type Business = { currency: string };
type Branch = { id: string; name: string; address?: string | null; isDefault: boolean };
type OrderLine = {
  id: string;
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
};
type Payment = {
  method: string;
  status: string;
  amount: number | string;
  reference: string;
  provider?: string | null;
  paidAt?: string | null;
};
type OrderReturn = {
  id: string;
  reference: string;
  status: "REQUESTED" | "REJECTED" | "COMPLETED";
  total: number | string;
  reason: string;
  createdAt: string;
  resolutionNote?: string | null;
  refunds: { reference: string; amount: number | string; method: string; status: string }[];
};
type OnlineOrder = {
  id: string;
  number: string;
  status: string;
  branchId: string;
  branch?: { id: string; name: string; address: string | null };
  customerName: string;
  customerEmail: string;
  customerPhone?: string | null;
  fulfillmentMethod: "DELIVERY" | "COLLECTION";
  deliveryAddress?: string | null;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  deliveryFee: number | string;
  total: number | string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  lines: OrderLine[];
  payments: Payment[];
  returns: OrderReturn[];
};
type Transition =
  | "PROCESSING"
  | "READY_FOR_COLLECTION"
  | "DISPATCHED"
  | "DELIVERED"
  | "COLLECTED"
  | "CANCELLED"
  | "RETURN_REQUESTED";

const statusOptions = [
  "ALL",
  "PENDING_PAYMENT",
  "PAYMENT_FAILED",
  "PAID",
  "PROCESSING",
  "READY_FOR_COLLECTION",
  "DISPATCHED",
  "DELIVERED",
  "COLLECTED",
  "PARTIALLY_FULFILLED",
  "RETURN_REQUESTED",
  "CANCELLED",
];
const formatMoney = (value: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(value));
const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const label = (value: string) => value.toLowerCase().replaceAll("_", " ");

function nextTransition(
  order: OnlineOrder,
): { status: Transition; label: string } | undefined {
  if (order.status === "PAID")
    return { status: "PROCESSING", label: "Start preparing" };
  if (order.status === "PROCESSING")
    return order.fulfillmentMethod === "COLLECTION"
      ? { status: "READY_FOR_COLLECTION", label: "Ready for pickup" }
      : { status: "DISPATCHED", label: "Send out" };
  if (order.status === "READY_FOR_COLLECTION")
    return { status: "COLLECTED", label: "Mark picked up" };
  if (order.status === "DISPATCHED")
    return { status: "DELIVERED", label: "Mark delivered" };
  return undefined;
}

export default function OnlineOrdersPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const branchesQuery = useBranches<Branch>();
  const branches = branchesQuery.data?.data ?? [];
  const businessQuery = useBusiness<Business>();
  const currency = businessQuery.data?.data.currency || "NGN";
  const branchId = useBranchStore((state) => state.selectedBranchId);
  const setBranchId = useBranchStore((state) => state.setSelectedBranchId);
  const ordersQuery = useOnlineOrders<OnlineOrder>(branchId, Boolean(user));
  const transitionMutation = useTransitionOnlineOrder();
  const receivePickupPaymentMutation = useReceivePickupPayment();
  const orders = ordersQuery.data?.data ?? [];
  const counts = ordersQuery.data?.counts ?? {};
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const loading = ordersQuery.isLoading;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pickupPaymentOrder, setPickupPaymentOrder] = useState<OnlineOrder | null>(null);
  const [pickupPaymentMethod, setPickupPaymentMethod] = useState<"CASH" | "BANK_TRANSFER" | "CARD">("CASH");
  const [pickupPaymentReference, setPickupPaymentReference] = useState("");
  const pageError = error || (ordersQuery.error instanceof Error
    ? ordersQuery.error.message
    : "");

  const canTransition = user?.role === "OWNER" || user?.role === "STAFF";

  useEffect(() => {
    if (branchId || !branches.length) return;
    setBranchId(branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? "");
  }, [branchId, branches]);

  const filteredOrders = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return orders.filter(
      (order) =>
        (status === "ALL" || (status === "RETURN_REQUESTED"
          ? order.returns.some((item) => item.status === "REQUESTED") || order.status === status
          : order.status === status)) &&
        (!needle ||
          `${order.number} ${order.customerName} ${order.customerEmail} ${order.customerPhone ?? ""}`
            .toLowerCase()
            .includes(needle)),
    );
  }, [orders, search, status]);

  const orderCount = Object.values(counts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const awaitingFulfillment = [
    "PAID",
    "PROCESSING",
    "READY_FOR_COLLECTION",
    "DISPATCHED",
    "PARTIALLY_FULFILLED",
  ].reduce((sum, key) => sum + (counts[key] ?? 0), 0);
  const returnRequests = counts.RETURN_REQUESTED ?? 0;

  async function transition(order: OnlineOrder, next: Transition) {
    setBusy(order.id);
    setError("");
    setNotice("");
    try {
      await transitionMutation.mutateAsync({ id: order.id, status: next });
      setNotice(`${order.number} moved to ${label(next)}.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The order could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }

  async function recordPickupPayment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!pickupPaymentOrder) return;
    setBusy(pickupPaymentOrder.id);
    setError("");
    setNotice("");
    try {
      await receivePickupPaymentMutation.mutateAsync({
        id: pickupPaymentOrder.id,
        method: pickupPaymentMethod,
        reference: pickupPaymentReference.trim() || undefined,
      });
      setNotice(`Pickup payment for ${pickupPaymentOrder.number} was recorded.`);
      setPickupPaymentOrder(null);
      setPickupPaymentReference("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The pickup payment could not be recorded.",
      );
    } finally {
      setBusy("");
    }
  }

  if (!user)
    return <AdminPageSkeleton />;
  if (user.role !== "OWNER" && user.role !== "STAFF") {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
        <div>
          <h1 className="text-xl font-normal">
            This account cannot open website orders
          </h1>
          <Link
            className="mt-4 inline-block text-brand underline"
            href="/admin"
          >
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-sm font-normal uppercase tracking-[.14em] text-brand">
              Store operations
            </p>
            <h1 className="text-2xl font-normal tracking-tight">
              Website orders
            </h1>
            <p className="mt-1 text-sm text-muted">
              Check payments and prepare paid orders for delivery or pickup.
            </p>
          </div>
          <label className="grid gap-1 text-xs font-normal text-muted">
            Branch
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="h-10 min-w-52 rounded-md border border-line bg-white px-3 text-sm text-foreground outline-none focus:border-brand"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isDefault ? " | Default" : ""}
                </option>
              ))}
            </select>
          </label>
        </section>

        {pageError && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <span>{pageError}</span>
            <button
              className="font-normal underline"
              onClick={() => void ordersQuery.refetch()}
            >
              Retry
            </button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            {notice}
          </div>
        )}

        <section
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Order summary"
        >
          <article className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">Orders listed</p>
            <strong className="mt-2 block text-2xl font-normal">
              {loading && !orders.length ? "-" : orderCount}
            </strong>
            <p className="mt-1 text-xs text-muted">
              Most recent 200, across this business
            </p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">Not yet delivered</p>
            <strong className="mt-2 block text-2xl font-normal">
              {loading && !orders.length ? "-" : awaitingFulfillment}
            </strong>
            <p className="mt-1 text-xs text-muted">
              Paid, processing or in delivery
            </p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">Return requests</p>
            <strong className="mt-2 block text-2xl font-normal">
              {loading && !orders.length ? "-" : returnRequests}
            </strong>
            <p className="mt-1 text-xs text-muted">
              Check these requests before returning money.
            </p>
          </article>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-normal">Website orders</h2>
              <p className="mt-1 text-xs text-muted">
                {filteredOrders.length} shown from the latest {orders.length}{" "}
                loaded
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search order or customer"
                aria-label="Search orders"
                className="h-10 rounded-md border border-line px-3 text-sm outline-none placeholder:text-muted focus:border-brand"
              />
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter by order status"
                className="h-10 rounded-md border border-line bg-white px-3 text-sm capitalize outline-none focus:border-brand"
              >
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {item === "ALL" ? "All statuses" : label(item)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading && !orders.length ? (
            <AdminTableSkeleton columns={5} rows={6} />
          ) : !filteredOrders.length ? (
            <div className="p-12 text-center">
              <p className="font-normal">No matching orders</p>
              <p className="mt-1 text-sm text-muted">
                Try another status, search term or branch.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-line">
              {filteredOrders.map((order) => {
                const next = nextTransition(order);
                const branchName = order.branch?.name
                  ?? branches.find((branch) => branch.id === order.branchId)?.name
                  ?? "Branch";
                return (
                  <article
                    key={order.id}
                    className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-5"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-normal">{order.number}</h3>
                        <span className={statusPill(order.status)}>
                          {label(order.status)}
                        </span>
                        {order.returns.map((item) => (
                          <span key={item.id} className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${item.status === "REQUESTED" ? "bg-amber-100 text-amber-800" : item.status === "COMPLETED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                            {item.status === "REQUESTED" ? "Online return requested" : item.status === "COMPLETED" ? "Online return approved" : "Online return declined"}
                          </span>
                        ))}
                        <span className="rounded bg-canvas px-2 py-1 text-sm capitalize text-muted">
                          {label(order.fulfillmentMethod)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm">
                        {order.customerName}{" "}
                        <span className="text-muted">
                          | {order.customerEmail}
                        </span>
                      </p>
                      {order.fulfillmentMethod === "COLLECTION" && (
                        <p className="mt-1 text-xs font-medium text-brand">
                          Customer pickup location: {branchName} ·{" "}
                          {order.branch?.address ?? branches.find((branch) => branch.id === order.branchId)?.address ?? "No branch address saved"}
                        </p>
                      )}
                      <p className="mt-1 text-xs text-muted">
                        Fulfillment branch: {branchName} | Placed {formatDate(order.createdAt)} |{" "}
                        {order.lines.length} item
                        {order.lines.length === 1 ? "" : "s"}
                      </p>
                      {order.returns.map((item) => (
                        <div key={item.id} className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                          <span><strong>{item.status === "REQUESTED" ? "Customer return request" : `Return ${label(item.status)}`} · {item.reference}</strong> · {formatMoney(item.total, currency)} · {item.reason}</span>
                          {item.refunds.map((refund) => <span key={refund.reference} className="font-medium">Refund {label(refund.status)} · {formatMoney(refund.amount, currency)}</span>)}
                          {item.status === "REQUESTED" && <Link href={`/admin/sales/returns?reference=${encodeURIComponent(order.number)}`} className="font-semibold text-brand underline">Review request</Link>}
                          {item.resolutionNote && <span>Store note: {item.resolutionNote}</span>}
                        </div>
                      ))}
                      <details className="mt-3 text-xs">
                        <summary className="w-fit cursor-pointer font-normal text-brand">
                          Order details
                        </summary>
                        <div className="mt-3 grid gap-4 rounded-md bg-canvas p-3 sm:grid-cols-2">
                          <section className="min-w-0">
                            <h4 className="mb-2 font-normal text-foreground">Items</h4>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-[32rem] text-left">
                                <thead>
                                  <tr className="border-b border-line text-muted">
                                    <th className="py-2 pr-3 font-medium">Product</th>
                                    <th className="py-2 pr-3 font-medium">SKU</th>
                                    <th className="py-2 pr-3 text-right font-medium">Qty</th>
                                    <th className="py-2 pr-3 text-right font-medium">Unit price</th>
                                    <th className="py-2 text-right font-medium">Line total</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {order.lines.map((line) => (
                                    <tr key={line.id} className="border-b border-line/70">
                                      <td className="py-2 pr-3 text-foreground">{line.productName}</td>
                                      <td className="py-2 pr-3 font-mono text-muted">{line.sku}</td>
                                      <td className="py-2 pr-3 text-right text-foreground">{Number(line.quantity).toLocaleString()}</td>
                                      <td className="py-2 pr-3 text-right text-foreground">{formatMoney(line.unitPrice, currency)}</td>
                                      <td className="py-2 text-right font-medium text-foreground">{formatMoney(line.lineTotal, currency)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </section>

                          <section className="space-y-4">
                            <div>
                              <h4 className="mb-2 font-normal text-foreground">Customer & fulfillment</h4>
                              <dl className="grid gap-1 text-muted">
                                <div><dt className="inline font-medium text-foreground">Name: </dt><dd className="inline">{order.customerName}</dd></div>
                                <div><dt className="inline font-medium text-foreground">Email: </dt><dd className="inline break-all">{order.customerEmail}</dd></div>
                                <div><dt className="inline font-medium text-foreground">Phone: </dt><dd className="inline">{order.customerPhone || "Not provided"}</dd></div>
                                <div><dt className="inline font-medium text-foreground">Method: </dt><dd className="inline">{label(order.fulfillmentMethod)}</dd></div>
                                <div><dt className="inline font-medium text-foreground">{order.fulfillmentMethod === "COLLECTION" ? "Pickup branch: " : "Stock branch: "}</dt><dd className="inline">{branchName}</dd></div>
                                {order.branch?.address && <div><dt className="inline font-medium text-foreground">Branch address: </dt><dd className="inline">{order.branch.address}</dd></div>}
                                {order.deliveryAddress && <div><dt className="inline font-medium text-foreground">Delivery address: </dt><dd className="inline">{order.deliveryAddress}</dd></div>}
                                <div><dt className="inline font-medium text-foreground">Order placed: </dt><dd className="inline">{formatDate(order.createdAt)}</dd></div>
                                <div><dt className="inline font-medium text-foreground">Last updated: </dt><dd className="inline">{formatDate(order.updatedAt)}</dd></div>
                                {order.expiresAt && <div><dt className="inline font-medium text-foreground">Payment/reservation deadline: </dt><dd className="inline">{formatDate(order.expiresAt)}</dd></div>}
                              </dl>
                            </div>
                            <div>
                              <h4 className="mb-2 font-normal text-foreground">Payment</h4>
                              {order.payments.length ? (
                                <ul className="space-y-2">
                                  {order.payments.map((payment) => (
                                    <li key={payment.reference} className="rounded border border-line bg-white p-2">
                                      <p className="font-medium text-foreground">
                                        {label(payment.status)} · {formatMoney(payment.amount, currency)}
                                      </p>
                                      <p className="mt-1">
                                        {label(payment.method)}
                                        {payment.provider ? ` via ${payment.provider}` : ""}
                                      </p>
                                      <p className="mt-1 break-all">Reference: {payment.reference}</p>
                                      {payment.paidAt && <p className="mt-1">Paid: {formatDate(payment.paidAt)}</p>}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-muted">No payment recorded.</p>
                              )}
                            </div>
                            <div>
                              <h4 className="mb-2 font-normal text-foreground">Order total</h4>
                              <dl className="space-y-1">
                                <div className="flex justify-between gap-3"><dt>Subtotal</dt><dd>{formatMoney(order.subtotal, currency)}</dd></div>
                                {Number(order.discount) > 0 && <div className="flex justify-between gap-3"><dt>Discount</dt><dd>-{formatMoney(order.discount, currency)}</dd></div>}
                                {Number(order.tax) > 0 && <div className="flex justify-between gap-3"><dt>Tax</dt><dd>{formatMoney(order.tax, currency)}</dd></div>}
                                <div className="flex justify-between gap-3"><dt>Delivery fee</dt><dd>{formatMoney(order.deliveryFee, currency)}</dd></div>
                                <div className="flex justify-between gap-3 border-t border-line pt-2 font-medium text-foreground"><dt>Total</dt><dd>{formatMoney(order.total, currency)}</dd></div>
                              </dl>
                            </div>
                          </section>
                        </div>
                      </details>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <strong className="mr-2 text-sm">
                        {formatMoney(order.total, currency)}
                      </strong>
                      {canTransition && next && (
                        <button
                          disabled={busy === order.id}
                          onClick={() => void transition(order, next.status)}
                          className="rounded-md bg-brand px-3 py-2 text-xs font-normal text-white hover:bg-brand-dark disabled:opacity-60"
                        >
                          {busy === order.id ? "Updating..." : next.label}
                        </button>
                      )}
                      {canTransition && order.status === "PENDING_PAYMENT" && (
                        <button
                          disabled={busy === order.id}
                          onClick={() => void transition(order, "CANCELLED")}
                          className="rounded-md border border-line px-3 py-2 text-xs font-normal text-muted hover:bg-canvas disabled:opacity-60"
                        >
                          Cancel unpaid order
                        </button>
                      )}
                      {canTransition && order.fulfillmentMethod === "COLLECTION" && order.status === "PENDING_PAYMENT" && (
                        <button
                          disabled={busy === order.id}
                          onClick={() => {
                            setPickupPaymentOrder(order);
                            setPickupPaymentMethod("CASH");
                            setPickupPaymentReference("");
                          }}
                          className="rounded-md border border-brand px-3 py-2 text-xs font-normal text-brand hover:bg-canvas disabled:opacity-60"
                        >
                          Record pickup payment
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
        <p className="text-xs text-muted">
          This page shows the latest 200 orders. The system checks each payment
          and holds stock for you.
        </p>
      </div>
      {pickupPaymentOrder && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && busy !== pickupPaymentOrder.id) {
              setPickupPaymentOrder(null);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pickup-payment-title"
            className="w-full max-w-md rounded-lg border border-line bg-white p-5 shadow-xl"
          >
            <h2 id="pickup-payment-title" className="text-lg font-normal">
              Record pickup payment
            </h2>
            <p className="mt-1 text-sm text-muted">
              {pickupPaymentOrder.number} · {formatMoney(pickupPaymentOrder.total, currency)}
            </p>
            <form onSubmit={(event) => void recordPickupPayment(event)} className="mt-5 space-y-4">
              <label className="grid gap-1 text-sm">
                Payment received by
                <select
                  value={pickupPaymentMethod}
                  onChange={(event) => setPickupPaymentMethod(event.target.value as "CASH" | "BANK_TRANSFER" | "CARD")}
                  className="h-10 rounded-md border border-line bg-white px-3"
                >
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="CARD">Card / POS</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Reference (optional)
                <input
                  value={pickupPaymentReference}
                  onChange={(event) => setPickupPaymentReference(event.target.value)}
                  maxLength={80}
                  className="h-10 rounded-md border border-line px-3"
                />
              </label>
              {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={busy === pickupPaymentOrder.id}
                  onClick={() => setPickupPaymentOrder(null)}
                  className="rounded-md border border-line px-3 py-2 text-sm disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy === pickupPaymentOrder.id}
                  className="rounded-md bg-brand px-3 py-2 text-sm text-white disabled:opacity-60"
                >
                  {busy === pickupPaymentOrder.id ? "Recording..." : "Confirm payment received"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
