"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useBusiness } from "@/hooks/queries/use-business";
import { useOnlineOrders } from "@/hooks/queries/use-online-orders";
import { useTransitionOnlineOrder } from "@/hooks/mutations/use-order-mutations";
import { useBranchStore } from "@/stores/branch.store";
import { AdminPageSkeleton, AdminTableSkeleton } from "@/components/admin-loading-skeleton";

type User = { id: string; name: string; email: string; role: string };
type Business = { currency: string };
type Branch = { id: string; name: string; isDefault: boolean };
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
};
type OnlineOrder = {
  id: string;
  number: string;
  status: string;
  branchId: string;
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
  lines: OrderLine[];
  payments: Payment[];
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
  if (["DELIVERED", "COLLECTED"].includes(order.status))
    return { status: "RETURN_REQUESTED", label: "Report a return" };
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
  const orders = ordersQuery.data?.data ?? [];
  const counts = ordersQuery.data?.counts ?? {};
  const [status, setStatus] = useState("ALL");
  const [search, setSearch] = useState("");
  const loading = ordersQuery.isLoading;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
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
        (status === "ALL" || order.status === status) &&
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
                const branchName =
                  branches.find((branch) => branch.id === order.branchId)
                    ?.name ?? "Branch";
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
                      <p className="mt-1 text-xs text-muted">
                        {branchName} | {formatDate(order.createdAt)} |{" "}
                        {order.lines.length} item
                        {order.lines.length === 1 ? "" : "s"}
                      </p>
                      <details className="mt-3 text-xs">
                        <summary className="w-fit cursor-pointer font-normal text-brand">
                          Order details
                        </summary>
                        <div className="mt-3 grid gap-3 rounded-md bg-canvas p-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            {order.lines.map((line) => (
                              <div
                                key={line.id}
                                className="flex justify-between gap-4"
                              >
                                <span>
                                  {line.productName}{" "}
                                  <span className="text-muted">
                                    x {Number(line.quantity).toLocaleString()}
                                  </span>
                                </span>
                                <span className="font-normal">
                                  {formatMoney(line.lineTotal, currency)}
                                </span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t border-line pt-2 font-normal">
                              <span>Total</span>
                              <span>{formatMoney(order.total, currency)}</span>
                            </div>
                          </div>
                          <div className="space-y-1 text-muted">
                            <p>{order.customerPhone || "No phone provided"}</p>
                            {order.deliveryAddress && (
                              <p>{order.deliveryAddress}</p>
                            )}
                            <p>
                              Payment:{" "}
                              {order.payments
                                .map(
                                  (payment) =>
                                    `${label(payment.status)} | ${formatMoney(payment.amount, currency)} (${label(payment.method)})`,
                                )
                                .join(", ") || "No payment recorded"}
                            </p>
                          </div>
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
    </main>
  );
}
