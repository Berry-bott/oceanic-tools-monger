"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { useProducts } from "@/hooks/queries/use-products";
import { usePurchasingOverview } from "@/hooks/queries/use-purchasing-overview";
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
    try {
      await createPurchaseOrder({
          supplierId: form.get("supplierId"),
          branchId: form.get("branchId"),
          expectedAt: form.get("expectedAt") || undefined,
          notes: form.get("notes") || undefined,
          lines: [
            {
              productId: form.get("productId"),
              quantity: Number(form.get("quantity")),
              unitCost: Number(form.get("unitCost")),
            },
          ],
      });
      setOrderOpen(false);
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
    const line = order.lines.find((candidate) => {
      const received = candidate.receiptLines.reduce(
        (sum, row) => sum + n(row.acceptedQuantity) + n(row.rejectedQuantity),
        0,
      );
      return received < n(candidate.orderedQuantity);
    });
    if (!line) {
      setActionError(
        "There are no outstanding quantities to receive on this order.",
      );
      return;
    }
    const alreadyReceived = line.receiptLines.reduce(
      (sum, row) => sum + n(row.acceptedQuantity) + n(row.rejectedQuantity),
      0,
    );
    const outstanding = Math.max(0, n(line.orderedQuantity) - alreadyReceived);
    const input = window.prompt(
      `Accept quantity for ${line.product.name} (${outstanding} outstanding):`,
      String(outstanding),
    );
    if (input === null) return;
    const accepted = Number(input);
    if (!Number.isFinite(accepted) || accepted < 0 || accepted > outstanding) {
      setActionError(`Enter a quantity between 0 and ${outstanding}.`);
      return;
    }
    setBusy(order.id);
    setActionError("");
    setNotice("");
    try {
      await receivePurchaseOrder(order.id, {
          lines: [
            {
              purchaseOrderLineId: line.id,
              acceptedQuantity: accepted,
              rejectedQuantity: 0,
              unitCost: n(line.unitCost),
            },
          ],
      });
      setNotice("Goods receipt recorded and inventory updated.");
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Goods receipt could not be saved.",
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
        <span>Loading purchasing</span>
      </main>
    );
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
          {actionError && (
            <p
              className="m-0 text-[#b44f44] text-sm leading-normal"
              role="alert"
            >
              {actionError}
            </p>
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
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>ORDER</th>
                    <th>SUPPLIER</th>
                    <th>BRANCH</th>
                    <th>ITEMS</th>
                    <th>EXPECTED</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
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
                              `${line.product.name}  ${n(line.orderedQuantity)}`,
                          )
                          .join(", ")}
                      </td>
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
                  ))}
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
      {supplierOpen && (
        <div
          className="fixed [inset:0] bg-[#14201e66] [backdrop-filter:blur(2px)] z-[70] grid [place-items:center] p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSupplierOpen(false);
          }}
        >
          <section
            className="[width:min(100%,485px)] [max-height:min(90vh,750px)] overflow-auto bg-white rounded-xl shadow-[0_24px_70px_#17251f42] p-[21px] [&_form]:grid [&_form]:gap-3 max-[620px]:p-[17px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="supplier-title"
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
                className="[border:0] bg-transparent text-[#76837b] h-[32px] w-[32px] grid [place-items:center] rounded-lg [&:hover]:bg-[#f1f6f2] [&:hover]:text-[#28644c]"
                onClick={() => setSupplierOpen(false)}
                aria-label="Close"
              ></button>
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
              {actionError && (
                <p className="m-0 text-[#b44f44] text-sm leading-normal">
                  {actionError}
                </p>
              )}
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
          </section>
        </div>
      )}
      {orderOpen && (
        <div
          className="fixed [inset:0] bg-[#14201e66] [backdrop-filter:blur(2px)] z-[70] grid [place-items:center] p-5"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOrderOpen(false);
          }}
        >
          <section
            className="[width:min(100%,485px)] [max-height:min(90vh,750px)] overflow-auto bg-white rounded-xl shadow-[0_24px_70px_#17251f42] p-[21px] [&_form]:grid [&_form]:gap-3 max-[620px]:p-[17px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="po-title"
          >
            <div className="flex justify-between items-start [margin-bottom:18px] [&>div]:flex [&>div]:gap-2.5 [&>div]:items-center [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_h2]:tracking-[-.3px] [&_p]:text-sm [&_p]:text-[#89948b] [&_p]:m-0">
              <div>
                <span className="w-[37px] h-[37px] grid [place-items:center] bg-[#edf5f0] text-[#2a6a51] rounded-xl"></span>
                <div>
                  <h2 id="po-title">Create supplier order</h2>
                  <p>Stock changes after you record the items received.</p>
                </div>
              </div>
              <button
                className="[border:0] bg-transparent text-[#76837b] h-[32px] w-[32px] grid [place-items:center] rounded-lg [&:hover]:bg-[#f1f6f2] [&:hover]:text-[#28644c]"
                onClick={() => setOrderOpen(false)}
                aria-label="Close"
              ></button>
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
              <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                Product
                <select name="productId" required defaultValue="">
                  <option value="" disabled>
                    Select product
                  </option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.sku}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Quantity
                  <input
                    name="quantity"
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Unit cost
                  <input
                    name="unitCost"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                  />
                </label>
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
              {actionError && (
                <p className="m-0 text-[#b44f44] text-sm leading-normal">
                  {actionError}
                </p>
              )}
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
          </section>
        </div>
      )}
    </div>
  );
}
