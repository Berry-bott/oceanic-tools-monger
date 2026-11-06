"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { usePurchasingOverview } from "@/hooks/queries/use-purchasing-overview";
import { AdminDialogPanel } from "@/components/admin-motion";
import { AppErrorModal } from "@/components/app-error-modal";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import {
  createPurchaseOrder,
  createSupplier as createSupplierRequest,
  receivePurchaseOrder,
  transitionPurchaseOrder,
} from "@/services/purchasing/purchasing.service";

type User = { id: string; name: string; email: string; role: string };
type Branch = { id: string; name: string; isDefault: boolean };
type Product = {
  id: string;
  name: string;
  sku: string;
  costPrice?: number | string;
};
type Supplier = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  outstanding: number;
  overdue: number;
  _count: { purchaseOrders: number };
};
type OrderLineDraft = { productId: string; quantity: string; unitCost: string };
type POLine = {
  id: string;
  product: Product;
  orderedQuantity: number | string;
  unitCost: number | string;
  receiptLines: {
    acceptedQuantity: number | string;
    rejectedQuantity: number | string;
  }[];
};
type Purchase = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  expectedAt?: string | null;
  supplier: { id: string; name: string };
  branch: { id: string; name: string };
  lines: POLine[];
  receipts: { id: string; reference: string; receivedAt: string }[];
  invoices?: { totalAmount: number | string; dueAt?: string | null; allocations: { amount: number | string; payment: { status: string } }[] }[];
};
const manager = (role?: string) =>
  role === "OWNER" || role === "STAFF";
const money = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(
    new Date(value),
  );
const n = (value: number | string) => Number(value);

export default function PurchasingPage() {
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const branchesQuery = useBranches<Branch>();
  const productsQuery = useProducts("");
  const purchasingQuery = usePurchasingOverview<Supplier, Purchase>(Boolean(user));
  const branches = branchesQuery.data?.data ?? [];
  const products = productsQuery.data?.data ?? [];
  const suppliers = purchasingQuery.data?.suppliers ?? [];
  const orders = purchasingQuery.data?.orders ?? [];
  const loading = purchasingQuery.isLoading;
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [orderLineDrafts, setOrderLineDrafts] = useState<OrderLineDraft[]>([{ productId: "", quantity: "1", unitCost: "" }]);
  const [receivingOrder, setReceivingOrder] = useState<Purchase | null>(null);
  const [amountPaid, setAmountPaid] = useState(0);
  const [receiptTotal, setReceiptTotal] = useState(0);

  const reload = useCallback(async () => {
    await Promise.all([purchasingQuery.refetch(), invalidateAdminSummaries(queryClient)]);
  }, [purchasingQuery.refetch, queryClient]);

  const pageError = purchasingQuery.error instanceof Error
    ? purchasingQuery.error.message
    : purchasingQuery.isError
      ? "Purchasing data could not be loaded."
      : "";

  async function submitAction(id: string, action: "submit" | "approve") {
    setBusy(id);
    setActionError("");
    setNotice("");
    try {
      await transitionPurchaseOrder(id, action);
      setNotice(
        `Supplier order ${action === "submit" ? "submitted for approval" : "approved"}.`,
      );
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error
          ? e.message
          : "The purchase order could not be updated.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createSupplier(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("supplier");
    setActionError("");
    const form = new FormData(event.currentTarget);
    try {
      await createSupplierRequest({
          name: form.get("name"),
          email: form.get("email") || undefined,
          phone: form.get("phone") || undefined,
          address: form.get("address") || undefined,
          paymentTermsDays: Number(form.get("paymentTermsDays") || 0),
      });
      setSupplierOpen(false);
      setNotice("Supplier added.");
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Supplier could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }

  async function createOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("purchase");
    setActionError("");
    const form = new FormData(event.currentTarget);
    const orderLines = orderLineDrafts.filter((line) => line.productId).map((line) => ({ productId: line.productId, quantity: Number(line.quantity), unitCost: Number(line.unitCost) }));
    if (!orderLines.length || orderLines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost) || line.unitCost < 0)) {
      setActionError("Add at least one item and enter a valid quantity and cost price for each item.");
      setBusy("");
      return;
    }
    try {
      await createPurchaseOrder({
          supplierId: form.get("supplierId"),
          branchId: form.get("branchId"),
          expectedAt: form.get("expectedAt") || undefined,
          notes: form.get("notes") || undefined,
          lines: orderLines,
      });
      setOrderOpen(false);
      setOrderLineDrafts([{ productId: "", quantity: "1", unitCost: "" }]);
      setNotice("Supplier order created as a draft.");
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Supplier order could not be created.",
      );
    } finally {
      setBusy("");
    }
  }

  async function receiveOrder(order: Purchase) {
    setActionError("");
    setAmountPaid(0);
    setReceiptTotal(order.lines.reduce((sum, line) => {
      const received = line.receiptLines.reduce((total, row) => total + n(row.acceptedQuantity) + n(row.rejectedQuantity), 0);
      return sum + Math.max(0, n(line.orderedQuantity) - received) * n(line.unitCost);
    }, 0));
    setReceivingOrder(order);
  }

  async function recordReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!receivingOrder) return;
    setBusy(receivingOrder.id);
    setActionError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    const lines = receivingOrder.lines.flatMap((line) => {
      const quantity = Number(form.get(`quantity-${line.id}`));
      if (quantity <= 0) return [];
      return [{ purchaseOrderLineId: line.id, acceptedQuantity: quantity, rejectedQuantity: 0, unitCost: Number(form.get(`cost-${line.id}`)) }];
    });
    const invoiceTotal = lines.reduce((sum, line) => sum + line.acceptedQuantity * line.unitCost, 0);
    const paid = Number(form.get("amountPaid") || 0);
    if (!lines.length) {
      setActionError("Enter a quantity received for at least one item.");
      setBusy("");
      return;
    }
    if (paid > invoiceTotal) {
      setActionError("Payment cannot be more than the received goods total.");
      setBusy("");
      return;
    }
    try {
      await receivePurchaseOrder(receivingOrder.id, {
        lines,
        invoice: {
          invoiceNumber: form.get("invoiceNumber") || receivingOrder.number,
          totalAmount: invoiceTotal,
          amountPaid: paid,
          dueAt: form.get("dueAt") || undefined,
          paymentMethod: paid > 0 ? form.get("paymentMethod") : undefined,
          paymentReference: paid > 0 ? form.get("paymentReference") : undefined,
        },
      });
      setReceivingOrder(null);
      setNotice(`Items received. Supplier bill: ${money(invoiceTotal)}; paid: ${money(paid)}; balance left: ${money(invoiceTotal - paid)}.`);
      await reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Goods receipt could not be saved.");
    } finally {
      setBusy("");
    }
  }

  if (!user)
    return <AdminPageSkeleton />;
  const canManage = manager(user.role);
  const openOrders = orders.filter((order) =>
    ["DRAFT", "SUBMITTED", "APPROVED", "PARTIALLY_RECEIVED"].includes(
      order.status,
    ),
  ).length;
  const outstanding = suppliers.reduce(
    (sum, supplier) => sum + n(supplier.outstanding),
    0,
  );
  const overdue = suppliers.reduce(
    (sum, supplier) => sum + n(supplier.overdue),
    0,
  );
  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">
                SUPPLIER &amp; BUYING
              </span>
              <h1>Buy stock</h1>
              <p>Manage suppliers, stock orders, deliveries and bills.</p>
            </div>
            {canManage && (
              <div className="flex gap-2 max-[620px]:w-full max-[620px]:[&_button]:[flex:1]">
                <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                  onClick={() => {
                    setActionError("");
                    setSupplierOpen(true);
                  }}
                >
                  {" "}
                  Supplier
                </button>
                <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                  onClick={() => {
                    setActionError("");
                    setOrderLineDrafts([{ productId: "", quantity: "1", unitCost: "" }]);
                    setOrderOpen(true);
                  }}
                  disabled={
                    !suppliers.length || !branches.length || !products.length
                  }
                >
                  {" "}
                  Supplier order
                </button>
              </div>
            )}
          </div>
          {pageError && (
            <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55] [&_strong]:text-[#a5554a] [&_p]:text-[#8e7974]">
              <strong>Purchasing unavailable</strong>
              <p>{pageError}</p>
              <button
                className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                onClick={() => void reload()}
              >
                Try again
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
          <section className="grid grid-cols-4 gap-3 mb-4 max-[620px]:grid-cols-2 max-[620px]:gap-2">
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>Suppliers</span>
              <strong>{loading ? "" : suppliers.length}</strong>
              <small>Active business suppliers</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>Open orders</span>
              <strong>{loading ? "" : openOrders}</strong>
              <small>Draft through partial receipt</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#a6782c]">
              <span>Supplier bills still unpaid</span>
              <strong>{loading ? "" : money(outstanding)}</strong>
              <small>Based on recorded invoices</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#ad5b4d]">
              <span>Overdue balance</span>
              <strong>{loading ? "" : money(overdue)}</strong>
              <small>Supplier invoices past due</small>
            </article>
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Supplier orders</h2>
                <p>
                  Latest 100 orders with workflow status and receiving actions.
                </p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:1180px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>SUPPLIER</th>
                    <th>BRANCH</th>
                    <th>ITEMS</th>
                    <th>ORDER TOTAL</th>
                    <th>PAID</th>
                    <th>BALANCE LEFT</th>
                    <th>DATE DUE</th>
                    <th>EXPECTED</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                        const invoiceTotal = order.invoices?.reduce((sum, invoice) => sum + n(invoice.totalAmount), 0) ?? 0;
                        const paidTotal = order.invoices?.reduce((sum, invoice) => sum + invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((paid, allocation) => paid + n(allocation.amount), 0), 0) ?? 0;
                        const orderTotal = order.lines.reduce((sum, line) => sum + n(line.orderedQuantity) * n(line.unitCost), 0);
                        const dueDates = order.invoices?.flatMap((invoice) => invoice.dueAt ? [invoice.dueAt] : []) ?? [];
                        const dueDate = dueDates.sort()[0];
                        return (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.number}</strong>
                        <small className="block text-[#9aa49d] text-sm [margin-top:4px]">
                          {date(order.createdAt)}
                        </small>
                      </td>
                      <td>{order.supplier.name}</td>
                      <td>{order.branch.name}</td>
                      <td>
                        {order.lines
                          .map(
                            (line) =>
                              `${line.product.name} - ${n(line.orderedQuantity)} x ${money(n(line.unitCost))}`,
                          )
                          .join(", ")}
                      </td>
                      <td><strong>{money(invoiceTotal || orderTotal)}</strong></td>
                      <td>{money(paidTotal)}</td>
                      <td>{money(Math.max(0, invoiceTotal - paidTotal))}</td>
                      <td>{dueDate ? date(dueDate) : "-"}</td>
                      <td>{order.expectedAt ? date(order.expectedAt) : ""}</td>
                      <td>
                        <span
                          className={statusPill(order.status.toLowerCase())}
                        >
                          {order.status.toLowerCase().replaceAll("_", " ")}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1 [&_.button-primary]:h-[27px] [&_.button-primary]:py-0 px-2 [&_.button-primary]:text-sm [&_.button-secondary]:h-[27px] [&_.button-secondary]:py-0 px-2 [&_.button-secondary]:text-sm">
                          {canManage && order.status === "DRAFT" && (
                            <button
                              className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                              disabled={busy === order.id}
                              onClick={() =>
                                void submitAction(order.id, "submit")
                              }
                            >
                              Send for approval
                            </button>
                          )}
                          {(user.role === "OWNER" || user.role === "STAFF") &&
                            order.status === "SUBMITTED" && (
                              <button
                                className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                                disabled={busy === order.id}
                                onClick={() =>
                                  void submitAction(order.id, "approve")
                                }
                              >
                                Approve
                              </button>
                            )}
                          {canManage &&
                            ["APPROVED", "PARTIALLY_RECEIVED"].includes(
                              order.status,
                            ) && (
                              <button
                                className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                                disabled={busy === order.id}
                                onClick={() => void receiveOrder(order)}
                              >
                                Record items received
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                        );
                  })}
                </tbody>
              </table>
            </div>
            {!orders.length && !loading && (
              <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55]">
                <strong>No purchase orders yet</strong>
                <p>
                  Add a supplier and create a draft purchase order to begin.
                </p>
              </div>
            )}
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden [margin-top:12px]">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Suppliers</h2>
                <p>Supplier bills show what you paid and what you still owe.</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>SUPPLIER</th>
                    <th>CONTACT</th>
                    <th>PURCHASE ORDERS</th>
                    <th>OUTSTANDING</th>
                    <th>OVERDUE</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((supplier) => (
                    <tr key={supplier.id}>
                      <td>
                        <strong>{supplier.name}</strong>
                      </td>
                      <td>{supplier.email || supplier.phone || ""}</td>
                      <td>{supplier._count.purchaseOrders}</td>
                      <td>
                        <strong>{money(n(supplier.outstanding))}</strong>
                      </td>
                      <td>{money(n(supplier.overdue))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!suppliers.length && !loading && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No suppliers yet.
              </p>
            )}
          </section>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Purchasing</span>
            <span>
              Receiving posts inventory and can optionally record a supplier
              invoice.
            </span>
          </footer>
        </div>
      </main>
      {supplierOpen && createPortal((
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-[#14201e66] p-4 [backdrop-filter:blur(2px)]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSupplierOpen(false);
          }}
        >
          <AdminDialogPanel
            className="[width:min(100%,485px)] [max-height:min(90vh,750px)] overflow-auto rounded-[14px] border border-line bg-white shadow-[0_24px_70px_#17251f42] p-4 [&_form]:grid [&_form]:gap-3"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-title"
            onEscape={() => setSupplierOpen(false)}
          >
            <div className="flex justify-between items-start [margin-bottom:18px] [&>div]:flex [&>div]:gap-2.5 [&>div]:items-center [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_h2]:tracking-[-.3px] [&_p]:text-sm [&_p]:text-[#89948b] [&_p]:m-0">
              <div>
                <span className="w-[37px] h-[37px] grid [place-items:center] bg-[#edf5f0] text-[#2a6a51] rounded-xl"></span>
                <div>
                  <h2 id="supplier-title">Add supplier</h2>
                  <p>Supplier contact and payment terms.</p>
                </div>
              </div>
              <button
                type="button"
                className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[#76837b] transition-colors hover:bg-[#f1f6f2] hover:text-[#28644c]"
                onClick={() => setSupplierOpen(false)}
                aria-label="Close"
              ><AdminUiIcon name="close" size={15} /></button>
            </div>
            <form onSubmit={(event) => void createSupplier(event)}>
              <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                Supplier name
                <input name="name" required maxLength={180} />
              </label>
              <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Email
                  <input name="email" type="email" maxLength={254} />
                </label>
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Phone
                  <input name="phone" maxLength={40} />
                </label>
              </div>
              <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                Address
                <input name="address" maxLength={1000} />
              </label>
              <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                Payment terms (days)
                <input
                  name="paymentTermsDays"
                  type="number"
                  min="0"
                  max="365"
                  defaultValue="0"
                />
              </label>
              <div className="flex justify-end gap-2 [padding-top:5px]">
                <button
                  type="button"
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                  onClick={() => setSupplierOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                  disabled={busy === "supplier"}
                >
                  {busy === "supplier" ? "Saving" : "Save supplier"}
                </button>
              </div>
            </form>
          </AdminDialogPanel>
        </div>
      ), document.body)}
      {orderOpen && createPortal((
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 [backdrop-filter:blur(2px)]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOrderOpen(false);
          }}
        >
          <AdminDialogPanel
            className="max-h-[calc(100dvh-2rem)] w-full max-w-[720px] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-[0_24px_70px_#17251f42] max-[620px]:p-4 [&_form]:grid [&_form]:gap-4 [&_input]:w-full [&_input]:min-w-0 [&_select]:w-full [&_select]:min-w-0"
            role="dialog"
            aria-modal="true"
            aria-labelledby="po-title"
            onEscape={() => setOrderOpen(false)}
          >
            <div className="mb-1 flex items-start justify-between gap-4 [&>div]:flex [&>div]:items-center [&>div]:gap-3 [&_h2]:m-0 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:tracking-[-.3px] [&_p]:m-0 [&_p]:mt-1 [&_p]:text-sm [&_p]:text-[#89948b]">
              <div>
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#2a6a51]"><AdminUiIcon name="box" size={19} /></span>
                <div>
                  <h2 id="po-title">Create supplier order</h2>
                  <p>Add the goods you are ordering, with the quantity and cost per unit.</p>
                </div>
              </div>
              <button
                type="button"
                className="grid size-8 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[#76837b] transition-colors hover:bg-[#f1f6f2] hover:text-[#28644c]"
                onClick={() => setOrderOpen(false)}
                aria-label="Close"
              ><AdminUiIcon name="close" size={15} /></button>
            </div>
            <form onSubmit={(event) => void createOrder(event)}>
              <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                Supplier
                <select name="supplierId" required defaultValue="">
                  <option value="" disabled>
                    Select supplier
                  </option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                Receiving branch
                <select name="branchId" required defaultValue="">
                  <option value="" disabled>
                    Select branch
                  </option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-3 rounded-xl border border-[#e6ece7] bg-[#fafcfb] p-3.5 max-[620px]:p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><strong className="text-sm font-semibold text-[#35453b]">Goods in this order</strong><p className="mb-0 mt-1 text-xs text-[#89948b]">Choose products and enter the incoming quantity and cost per unit.</p></div><button type="button" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#dce7de] bg-white px-3 text-sm font-medium text-brand transition-colors hover:bg-[#f1f7f2]" onClick={() => setOrderLineDrafts((lines) => [...lines, { productId: "", quantity: "1", unitCost: "" }])}><AdminUiIcon name="plus" size={15} />Add item</button></div>
                {orderLineDrafts.map((line, index) => <div key={index} className="grid grid-cols-[minmax(0,1fr)_130px_160px_40px] items-end gap-2 rounded-lg border border-[#e5ebe6] bg-white p-3 max-[620px]:grid-cols-2 max-[620px]:p-2.5">
                  <label className="grid gap-1.5 text-sm text-[#536159] max-[620px]:col-span-2">Product<select required value={line.productId} onChange={(event) => setOrderLineDrafts((current) => current.map((entry, i) => i === index ? { ...entry, productId: event.target.value, unitCost: String(products.find((product) => product.id === event.target.value)?.costPrice ?? entry.unitCost) } : entry))} className="h-10 rounded-md border border-[#dfe6e0] bg-white px-2.5 text-[#34413a]"><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>)}</select></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Quantity<input required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setOrderLineDrafts((current) => current.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry))} className="h-10 rounded-md border border-[#dfe6e0] px-2.5 text-[#34413a]" /></label>
                  <label className="grid gap-1.5 text-sm text-[#536159]">Cost price<input required type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => setOrderLineDrafts((current) => current.map((entry, i) => i === index ? { ...entry, unitCost: event.target.value } : entry))} className="h-10 rounded-md border border-[#dfe6e0] px-2.5 text-[#34413a]" /></label>
                  <button type="button" aria-label={`Remove item ${index + 1}`} title="Remove item" disabled={orderLineDrafts.length === 1} onClick={() => setOrderLineDrafts((current) => current.filter((_, i) => i !== index))} className="h-10 rounded-lg border border-[#e0e7e1] bg-white text-[#8e5c52] transition-colors hover:bg-[#fff5f2] disabled:opacity-40 max-[620px]:col-span-2 max-[620px]:justify-self-end max-[620px]:w-10"><AdminUiIcon name="trash" size={15} /></button>
                </div>)}
              </div>
              <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Expected date
                  <input name="expectedAt" type="date" />
                </label>
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Notes
                  <input name="notes" maxLength={2000} />
                </label>
              </div>
              <div className="flex justify-end gap-2 [padding-top:5px]">
                <button
                  type="button"
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                  onClick={() => setOrderOpen(false)}
                >
                  Cancel
                </button>
                <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                  disabled={busy === "purchase"}
                >
                  {busy === "purchase" ? "Creating" : "Create draft"}
                </button>
              </div>
            </form>
          </AdminDialogPanel>
        </div>
      ), document.body)}
      {receivingOrder && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceivingOrder(null); }}>
          <AdminDialogPanel className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-[14px] border border-line bg-white p-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="receipt-title" onEscape={() => setReceivingOrder(null)}>
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="receipt-title" className="m-0 text-lg font-semibold text-[#1a2a22]">Receive stock and record supplier bill</h2>
                <p className="mb-0 mt-1 text-sm text-[#75827a]">{receivingOrder.supplier.name} · Order {receivingOrder.number}. Enter the quantities that arrived and their cost price.</p>
              </div>
              <button type="button" aria-label="Close" className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line bg-white text-[#75827a] transition-colors hover:bg-[#f4f7f4]" onClick={() => setReceivingOrder(null)}><AdminUiIcon name="close" size={15} /></button>
            </div>
            <form onSubmit={(event) => void recordReceipt(event)} onChange={(event) => {
              const form = new FormData(event.currentTarget);
              const nextTotal = receivingOrder.lines.reduce((sum, line) => sum + Number(form.get(`quantity-${line.id}`) || 0) * Number(form.get(`cost-${line.id}`) || 0), 0);
              setReceiptTotal(nextTotal);
              setAmountPaid(Number(form.get("amountPaid") || 0));
            }} className="grid gap-4">
              <div className="overflow-auto rounded-lg border border-line">
                <table className="w-full min-w-[650px] border-collapse text-left text-sm">
                  <thead className="bg-[#f7f9f7] text-xs text-[#75827a]"><tr><th className="p-3">Item</th><th className="p-3">Ordered</th><th className="p-3">Still due</th><th className="p-3">Received now</th><th className="p-3">Cost price</th></tr></thead>
                  <tbody>{receivingOrder.lines.map((line) => {
                    const received = line.receiptLines.reduce((sum, row) => sum + n(row.acceptedQuantity) + n(row.rejectedQuantity), 0);
                    const remaining = Math.max(0, n(line.orderedQuantity) - received);
                    return <tr key={line.id} className="border-t border-line">
                      <td className="p-3"><strong className="font-medium text-[#35453b]">{line.product.name}</strong><small className="mt-1 block text-xs text-[#929d95]">{line.product.sku}</small></td>
                      <td className="p-3">{n(line.orderedQuantity)}</td><td className="p-3">{remaining}</td>
                      <td className="p-3"><input aria-label={`Received quantity for ${line.product.name}`} name={`quantity-${line.id}`} type="number" min="0" max={remaining} step="0.001" defaultValue={remaining} className="h-9 w-28 rounded-md border border-[#dfe6e0] px-2" /></td>
                      <td className="p-3"><input aria-label={`Cost price for ${line.product.name}`} name={`cost-${line.id}`} type="number" min="0" step="0.01" defaultValue={n(line.unitCost)} className="h-9 w-36 rounded-md border border-[#dfe6e0] px-2" /></td>
                    </tr>;
                  })}</tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className="grid gap-1.5 text-sm text-[#536159]">Supplier invoice number<input name="invoiceNumber" required maxLength={80} placeholder="Enter the number on the supplier bill" className="h-10 rounded-md border border-[#dfe6e0] px-3" /></label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Date payment is due<input name="dueAt" type="date" className="h-10 rounded-md border border-[#dfe6e0] px-3" /></label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment made now<input name="amountPaid" type="number" min="0" max={receiptTotal} step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} className="h-10 rounded-md border border-[#dfe6e0] px-3" /></label>
                <div className="rounded-lg bg-[#f5f8f5] p-3 text-sm text-[#536159]">Bill total <strong className="float-right text-[#26372d]">{money(receiptTotal)}</strong><br /><span className="mt-2 block">Balance left <strong className="float-right text-[#26372d]">{money(Math.max(0, receiptTotal - amountPaid))}</strong></span></div>
              </div>
              {amountPaid > 0 && <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment method<select name="paymentMethod" required className="h-10 rounded-md border border-[#dfe6e0] bg-white px-3"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment reference<input name="paymentReference" required maxLength={80} placeholder="Receipt or transfer reference" className="h-10 rounded-md border border-[#dfe6e0] px-3" /></label>
              </div>}
              <p className="m-0 text-xs text-[#829087]">Stock is added only for quantities recorded as received. Any unpaid amount stays as a supplier balance.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="h-9 rounded-lg border border-[#e0e7e1] bg-white px-4 text-sm text-[#4e5e54] hover:bg-[#f8faf8]" onClick={() => setReceivingOrder(null)}>Cancel</button>
                <button disabled={busy === receivingOrder.id} className="h-9 rounded-lg border border-brand bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:opacity-60">{busy === receivingOrder.id ? "Saving receipt…" : "Save received items and bill"}</button>
              </div>
            </form>
          </AdminDialogPanel>
        </div>
      )}
      <AppErrorModal message={actionError} onClose={() => setActionError("")} title="Purchasing action could not be completed" />
    </div>
  );
}
