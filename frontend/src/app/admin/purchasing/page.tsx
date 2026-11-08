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

type User = { id: string; name: string; email: string; role: string; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null };
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
type ReceiptLineDraft = { productId: string; quantity: string; unitCost: string };
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
const manager = (user?: User) =>
  user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");
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
const receiptValue = (lines: ReceiptLineDraft[]) =>
  Number(lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0).toFixed(2));

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
  const loading = purchasingQuery.isLoading;
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [supplierOpen, setSupplierOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState<Purchase | null>(null);
  const [receiveLineDrafts, setReceiveLineDrafts] = useState<ReceiptLineDraft[]>([]);
  const [receiveProductSearch, setReceiveProductSearch] = useState("");
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [selectedReceivingBranchId, setSelectedReceivingBranchId] = useState("");
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
      const result = await createSupplierRequest({
          name: form.get("name"),
          email: form.get("email") || undefined,
          phone: form.get("phone") || undefined,
          address: form.get("address") || undefined,
          paymentTermsDays: Number(form.get("paymentTermsDays") || 0),
      });
      setSelectedSupplierId(result.data.id);
      setSupplierOpen(false);
      setNotice(receiveOpen ? "Supplier added and selected for stock receiving." : "Supplier added.");
      await reload();
    } catch (e) {
      setActionError(
        e instanceof Error ? e.message : "Supplier could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }

  function openReceiveForm() {
    setActionError("");
    setNotice("");
    setSelectedSupplierId("");
    setSelectedReceivingBranchId(
      branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? "",
    );
    setReceiveLineDrafts([]);
    setReceiveProductSearch("");
    setAmountPaid(0);
    setReceiptTotal(0);
    setReceiveOpen(true);
  }

  async function recordNewStockReceipt(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSupplierId || !selectedReceivingBranchId) {
      setActionError("Select a supplier and receiving branch.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const orderLines = receiveLineDrafts.map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
      }));
    if (!orderLines.length || orderLines.some((line) => !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unitCost) || line.unitCost < 0)) {
      setActionError("Add at least one product and enter a valid received quantity and cost for each item.");
      return;
    }
    const invoiceTotal = Number(orderLines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0).toFixed(2));
    const paid = Number(form.get("amountPaid") || 0);
    if (!Number.isFinite(paid) || paid < 0 || paid > invoiceTotal) {
      setActionError("Payment must be between zero and the total value of the received goods.");
      return;
    }
    if (paid > 0 && (!form.get("paymentMethod") || !String(form.get("paymentReference") ?? "").trim())) {
      setActionError("Enter the payment method and reference for the amount paid.");
      return;
    }

    setBusy("receive");
    setActionError("");
    setNotice("");
    let orderNumber = "";
    try {
      const created = await createPurchaseOrder({
        supplierId: selectedSupplierId,
        branchId: selectedReceivingBranchId,
        notes: form.get("notes") || undefined,
        lines: orderLines,
      });
      orderNumber = created.data.number;
      await transitionPurchaseOrder(created.data.id, "approve");
      await receivePurchaseOrder(created.data.id, {
        notes: form.get("notes") || undefined,
        preserveProductCostPrice: true,
        lines: created.data.lines.map((line, index) => ({
          purchaseOrderLineId: line.id,
          acceptedQuantity: orderLines[index].quantity,
          rejectedQuantity: 0,
          unitCost: orderLines[index].unitCost,
        })),
        ...(invoiceTotal > 0 ? {
          invoice: {
            invoiceNumber: String(form.get("invoiceNumber") || orderNumber),
            totalAmount: invoiceTotal,
            amountPaid: paid,
            dueAt: form.get("dueAt") || undefined,
            paymentMethod: paid > 0 ? form.get("paymentMethod") : undefined,
            paymentReference: paid > 0 ? form.get("paymentReference") : undefined,
          },
        } : {}),
      });
      setReceiveOpen(false);
      setNotice(`Stock received. Supplier bill: ${money(invoiceTotal)}; paid: ${money(paid)}; balance left: ${money(invoiceTotal - paid)}.`);
      await reload();
    } catch (cause) {
      setActionError(orderNumber
        ? `Order ${orderNumber} was created, but receiving did not complete. Contact an administrator before retrying. ${cause instanceof Error ? cause.message : ""}`
        : cause instanceof Error ? cause.message : "Stock could not be received.");
      if (orderNumber) await purchasingQuery.refetch();
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
  const canManage = manager(user);
  const isOwner = user.role === "OWNER";
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
                INVENTORY RECEIVING
              </span>
              <h1>Receive stock</h1>
              <p>Record goods received from suppliers, add them to inventory, and track supplier bills.</p>
            </div>
            {canManage && (
              <div className="flex gap-2 max-[620px]:w-full max-[620px]:[&_button]:[flex:1]">
                <button
                  type="button"
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                  onClick={() => {
                    setActionError("");
                    setSupplierOpen(true);
                  }}
                >
                  {" "}
                  Supplier
                </button>
                {isOwner && <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                  onClick={openReceiveForm}
                  disabled={
                    !branches.length || productsQuery.isLoading
                  }
                >
                  Receive stock
                </button>}
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
          <section className={`grid ${isOwner ? "grid-cols-3" : "grid-cols-1"} gap-3 mb-4 max-[620px]:grid-cols-2 max-[620px]:gap-2`}>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>Suppliers</span>
              <strong>{loading ? "" : suppliers.length}</strong>
              <small>Active business suppliers</small>
            </article>
            {isOwner && <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#a6782c]">
              <span>Supplier bills still unpaid</span>
              <strong>{loading ? "" : money(outstanding)}</strong>
              <small>Based on recorded invoices</small>
            </article>}
            {isOwner && <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#ad5b4d]">
              <span>Overdue balance</span>
              <strong>{loading ? "" : money(overdue)}</strong>
              <small>Supplier invoices past due</small>
            </article>}
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden [margin-top:12px]">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Suppliers</h2>
                <p>{isOwner ? "Supplier bills show what you paid and what you still owe." : "Manage supplier contacts and purchasing history."}</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>SUPPLIER</th>
                    <th>CONTACT</th>
                    <th>PURCHASE ORDERS</th>
                    {isOwner && <><th>OUTSTANDING</th><th>OVERDUE</th></>}
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
                      {isOwner && <><td><strong>{money(n(supplier.outstanding))}</strong></td><td>{money(n(supplier.overdue))}</td></>}
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
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-[#14201e66] p-4 [backdrop-filter:blur(2px)]"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSupplierOpen(false);
          }}
        >
          <AdminDialogPanel
            className="my-auto [width:min(100%,485px)] [max-height:min(calc(100dvh_-_2rem),750px)] overflow-auto rounded-[14px] border border-line bg-white shadow-[0_24px_70px_#17251f42] p-4 [&_form]:grid [&_form]:gap-3"
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
      {receiveOpen && createPortal((
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-[#14201ecc] p-3 backdrop-blur-sm sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceiveOpen(false); }}>
          <AdminDialogPanel className="my-auto max-h-[calc(100dvh-1rem)] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[#e4ebe5] bg-white p-4 shadow-[0_28px_90px_#101a164d] sm:max-h-[calc(100dvh-2rem)] sm:p-5" role="dialog" aria-modal="true" aria-labelledby="receive-new-stock-title" onEscape={() => setReceiveOpen(false)}>
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#edf1ed] pb-4">
              <div className="flex items-start gap-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#2a6a51]"><AdminUiIcon name="box" size={20} /></span>
                <div>
                  <p className="mb-1 mt-0 text-[10px] font-semibold tracking-[.14em] text-[#718b79]">INVENTORY RECEIVING</p>
                  <h2 id="receive-new-stock-title" className="m-0 text-lg font-semibold tracking-tight text-[#1a2a22]">Receive stock</h2>
                  <p className="mb-0 mt-1 max-w-xl text-sm leading-5 text-[#75827a]">Add delivered goods and record the supplier bill.</p>
                </div>
              </div>
              <button type="button" aria-label="Close" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#e0e7e1] bg-white text-[#75827a] transition-colors hover:bg-[#f4f7f4]" onClick={() => setReceiveOpen(false)}><AdminUiIcon name="close" size={15} /></button>
            </div>
            <form onSubmit={(event) => void recordNewStockReceipt(event)} onChange={(event) => {
              const form = new FormData(event.currentTarget);
              setReceiptTotal(receiptValue(receiveLineDrafts.map((line, index) => ({
                ...line,
                quantity: String(form.get(`new-quantity-${index}`) ?? line.quantity),
                unitCost: String(form.get(`new-cost-${index}`) ?? line.unitCost),
              }))));
              setAmountPaid(Number(form.get("amountPaid") || 0));
            }} className="grid gap-3">
              <section className="grid gap-3 rounded-xl border border-[#e7ede8] bg-[#fbfcfb] p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1.5 text-sm text-[#536159]">Supplier
                  <select required value={selectedSupplierId} onChange={(event) => setSelectedSupplierId(event.target.value)} className="h-11 rounded-lg border border-[#dfe6e0] bg-white px-3 text-[#34413a] outline-none transition focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec]">
                    <option value="">Select an existing supplier</option>
                    {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Receiving branch
                <select required value={selectedReceivingBranchId} onChange={(event) => setSelectedReceivingBranchId(event.target.value)} className="h-11 rounded-lg border border-[#dfe6e0] bg-white px-3 text-[#34413a] outline-none transition focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec]">
                  <option value="">Select branch</option>
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
                <button type="button" className="h-11 rounded-lg border border-[#dce7de] bg-white px-3 text-sm font-medium text-brand transition hover:bg-[#f1f7f2]" onClick={() => { setActionError(""); setSupplierOpen(true); }}>Add supplier</button>
              </section>
              <section className="grid gap-3 rounded-xl border border-[#e7ede8] p-3 sm:p-4">
                <div><h3 className="m-0 text-sm font-semibold text-[#35453b]">Goods received</h3><p className="mb-0 mt-1 text-xs text-[#89948b]">Search for a product and add it before entering quantity and unit cost.</p></div>
                <label className="grid gap-1.5 text-sm text-[#536159]">Search products
                  <input type="search" value={receiveProductSearch} onChange={(event) => setReceiveProductSearch(event.target.value)} placeholder="Search by product name or SKU" aria-label="Search products to receive" className="h-11 rounded-lg border border-[#dfe6e0] bg-white px-3 text-sm outline-none transition focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec]" />
                </label>
                {receiveProductSearch.trim() && <div className="max-h-40 overflow-y-auto rounded-lg border border-[#e6ece7] bg-white" role="listbox" aria-label="Product search results">
                  {products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(receiveProductSearch.trim().toLowerCase()) && !receiveLineDrafts.some((line) => line.productId === product.id)).slice(0, 8).map((product) => <div key={product.id} className="flex items-center justify-between gap-3 border-b border-[#edf1ed] px-3 py-2 last:border-b-0">
                    <span className="min-w-0"><strong className="block truncate text-sm font-medium text-[#35453b]">{product.name}</strong><small className="text-xs text-[#89948b]">{product.sku}</small></span>
                    <button type="button" onClick={() => { const lines = [...receiveLineDrafts, { productId: product.id, quantity: "1", unitCost: String(product.costPrice ?? "0") }]; setReceiveLineDrafts(lines); setReceiptTotal(receiptValue(lines)); setReceiveProductSearch(""); }} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#dce7de] px-2.5 text-xs font-medium text-brand hover:bg-[#f1f7f2]"><AdminUiIcon name="plus" size={13} />Add</button>
                  </div>)}
                  {products.filter((product) => `${product.name} ${product.sku}`.toLowerCase().includes(receiveProductSearch.trim().toLowerCase()) && !receiveLineDrafts.some((line) => line.productId === product.id)).length === 0 && <p className="m-0 px-3 py-3 text-sm text-muted">No matching products available to add.</p>}
                </div>}
                {receiveLineDrafts.map((line, index) => {
                  const product = products.find((item) => item.id === line.productId);
                  return <div key={line.productId} className="grid grid-cols-[minmax(0,1fr)_120px_150px_36px] items-end gap-2 rounded-lg border border-[#e9eeea] bg-[#fbfcfb] p-3 max-[620px]:grid-cols-2">
                    <div className="min-w-0 pb-2 max-[620px]:col-span-2"><strong className="block truncate text-sm font-medium text-[#35453b]">{product?.name ?? "Product"}</strong><small className="text-xs text-[#89948b]">{product?.sku}</small></div>
                    <label className="grid gap-1 text-xs text-[#536159]">Quantity<input required name={`new-quantity-${index}`} type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => { const lines = receiveLineDrafts.map((entry, i) => i === index ? { ...entry, quantity: event.target.value } : entry); setReceiveLineDrafts(lines); setReceiptTotal(receiptValue(lines)); }} className="h-9 min-w-0 rounded-lg border border-[#dfe6e0] bg-white px-2 outline-none focus:border-[#6e9e7d]" /></label>
                    <label className="grid gap-1 text-xs text-[#536159]">Unit cost<input required name={`new-cost-${index}`} type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => { const lines = receiveLineDrafts.map((entry, i) => i === index ? { ...entry, unitCost: event.target.value } : entry); setReceiveLineDrafts(lines); setReceiptTotal(receiptValue(lines)); }} className="h-9 min-w-0 rounded-lg border border-[#dfe6e0] bg-white px-2 outline-none focus:border-[#6e9e7d]" /></label>
                    <button type="button" aria-label={`Remove ${product?.name ?? "product"}`} onClick={() => { const remaining = receiveLineDrafts.filter((_, i) => i !== index); setReceiveLineDrafts(remaining); setReceiptTotal(receiptValue(remaining)); }} className="grid size-9 place-items-center rounded-lg border border-[#e0e7e1] bg-white text-[#8e5c52] hover:bg-[#fff5f2] max-[620px]:col-span-2 max-[620px]:justify-self-end"><AdminUiIcon name="trash" size={14} /></button>
                  </div>;
                })}
                {!receiveLineDrafts.length && <p className="m-0 rounded-lg bg-[#f7f9f7] px-3 py-2.5 text-xs text-[#89948b]">Search above to add products to this receipt.</p>}
                <Link href="/admin/products/new?returnTo=receive-stock" className="inline-flex h-10 w-fit items-center gap-2 rounded-lg border border-[#dce7de] bg-white px-3 text-sm font-medium text-brand transition-colors hover:border-[#c5d8c9] hover:bg-[#f1f7f2]">
                  <AdminUiIcon name="plus" size={15} />Create a new product
                </Link>
              </section>
              <section className="grid gap-4 rounded-xl border border-[#e7ede8] bg-[#fbfcfb] p-4 sm:grid-cols-2 sm:p-5">
                <div className="sm:col-span-2"><h3 className="m-0 text-sm font-semibold text-[#35453b]">Supplier bill</h3><p className="mb-0 mt-1 text-xs text-[#89948b]">Add invoice details and any payment made now.</p></div>
                <label className="grid gap-1.5 text-sm text-[#536159]">Invoice number <span className="text-xs text-[#89948b]">Optional; defaults to the receipt number.</span><input name="invoiceNumber" maxLength={80} placeholder="Supplier invoice number" className="h-10 min-w-0 rounded-lg border border-[#dfe6e0] bg-white px-3" /></label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment due date<input name="dueAt" type="date" className="h-10 min-w-0 rounded-lg border border-[#dfe6e0] bg-white px-3" /></label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment made now<input name="amountPaid" type="number" min="0" max={receiptTotal} step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} className="h-10 min-w-0 rounded-lg border border-[#dfe6e0] bg-white px-3" /></label>
                <div className="grid content-center gap-2 rounded-xl border border-[#e1ebe3] bg-white p-3.5 text-sm text-[#536159]"><span>Bill total <strong className="float-right font-semibold text-[#26372d]">{money(receiptTotal)}</strong></span><span className="border-t border-[#edf1ed] pt-2">Balance left <strong className="float-right font-semibold text-[#26372d]">{money(Math.max(0, receiptTotal - amountPaid))}</strong></span></div>
              </section>
              {amountPaid > 0 && <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment method<select name="paymentMethod" required className="h-10 rounded-md border border-[#dfe6e0] bg-white px-3"><option value="CASH">Cash</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CARD">Card</option><option value="OTHER">Other</option></select></label>
                <label className="grid gap-1.5 text-sm text-[#536159]">Payment reference<input name="paymentReference" required maxLength={80} placeholder="Receipt or transfer reference" className="h-10 rounded-md border border-[#dfe6e0] px-3" /></label>
              </div>}
              <label className="grid gap-1.5 text-sm text-[#536159]">Notes <span className="text-xs text-muted">(optional)</span><textarea name="notes" maxLength={2000} rows={2} className="rounded-md border border-[#dfe6e0] px-3 py-2" /></label>
              <p className="m-0 text-xs text-[#829087]">Saving will add accepted quantities to inventory and record the supplier bill and any payment made.</p>
              <div className="flex justify-end gap-2">
                <button type="button" className="h-9 rounded-lg border border-[#e0e7e1] bg-white px-4 text-sm text-[#4e5e54] hover:bg-[#f8faf8]" onClick={() => setReceiveOpen(false)}>Cancel</button>
                <button disabled={busy === "receive" || !suppliers.length || !products.length} className="h-9 rounded-lg border border-brand bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:opacity-60">{busy === "receive" ? "Receiving…" : "Receive stock"}</button>
              </div>
            </form>
          </AdminDialogPanel>
        </div>
      ), document.body)}
      {receivingOrder && createPortal((
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setReceivingOrder(null); }}>
          <AdminDialogPanel className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-auto rounded-[14px] border border-line bg-white p-4 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="receipt-title" onEscape={() => setReceivingOrder(null)}>
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
                {isOwner && <label className="grid gap-1.5 text-sm text-[#536159]">Payment made now<input name="amountPaid" type="number" min="0" max={receiptTotal} step="0.01" value={amountPaid} onChange={(event) => setAmountPaid(Number(event.target.value))} className="h-10 rounded-md border border-[#dfe6e0] px-3" /></label>}
                <div className="rounded-lg bg-[#f5f8f5] p-3 text-sm text-[#536159]">Bill total <strong className="float-right text-[#26372d]">{money(receiptTotal)}</strong>{isOwner && <><br /><span className="mt-2 block">Balance left <strong className="float-right text-[#26372d]">{money(Math.max(0, receiptTotal - amountPaid))}</strong></span></>}</div>
              </div>
              {isOwner && amountPaid > 0 && <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
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
      ), document.body)}
      {viewingOrder && createPortal((
        <div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 [backdrop-filter:blur(2px)]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingOrder(null); }}>
          <AdminDialogPanel className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-[680px] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-[0_24px_70px_#17251f42] max-[620px]:p-4" role="dialog" aria-modal="true" aria-labelledby="purchase-detail-title" onEscape={() => setViewingOrder(null)}>
            <div className="mb-4 flex items-start justify-between gap-4 border-b border-[#edf1ed] pb-4">
              <div className="min-w-0"><p className="mb-1 mt-0 text-[10px] font-medium tracking-wide text-[#718b79]">SUPPLIER ORDER</p><h2 id="purchase-detail-title" className="m-0 truncate text-lg font-semibold tracking-[-.3px] text-[#26372d]">{viewingOrder.supplier.name}</h2><p className="mb-0 mt-1 text-sm text-[#89948b]">{viewingOrder.number} · Created {date(viewingOrder.createdAt)}</p></div>
              <button type="button" aria-label="Close order details" className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-lg border border-line bg-white text-[#75837a] transition-colors hover:bg-[#f4f7f4]" onClick={() => setViewingOrder(null)}><AdminUiIcon name="close" size={15} /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-[#e8ede9] bg-[#fbfcfb] p-4 text-sm max-[480px]:grid-cols-1">
                <div><span className="block text-xs text-[#89948b]">Status</span><span className={`mt-1 inline-flex ${statusPill(viewingOrder.status.toLowerCase())}`}>{viewingOrder.status.toLowerCase().replaceAll("_", " ")}</span></div>
                <div><span className="block text-xs text-[#89948b]">Branch</span><strong className="mt-1 block font-medium text-[#34463a]">{viewingOrder.branch.name}</strong></div>
                <div><span className="block text-xs text-[#89948b]">Expected date</span><strong className="mt-1 block font-medium text-[#34463a]">{viewingOrder.expectedAt ? date(viewingOrder.expectedAt) : "Not set"}</strong></div>
                <div><span className="block text-xs text-[#89948b]">Due date</span><strong className="mt-1 block font-medium text-[#34463a]">{(() => { const dueAt = viewingOrder.invoices?.find((invoice) => invoice.dueAt)?.dueAt; return dueAt ? date(dueAt) : "Not set"; })()}</strong></div>
              </div>
              <section className="rounded-xl border border-[#e8ede9] p-4">
                <h3 className="mb-3 mt-0 text-sm font-semibold text-[#34463a]">Items in this order</h3>
                <div className="grid gap-2">{viewingOrder.lines.map((line) => {
                  const received = line.receiptLines.reduce((sum, receipt) => sum + n(receipt.acceptedQuantity) + n(receipt.rejectedQuantity), 0);
                  return <div key={line.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg bg-[#f8faf8] px-3 py-2.5 text-sm"><div className="min-w-0"><strong className="block truncate font-medium text-[#34463a]">{line.product.name}</strong><span className="mt-0.5 block text-xs text-[#89948b]">{n(line.orderedQuantity)} ordered · {received} received</span></div><span className="text-right text-xs text-[#718078]">{money(n(line.unitCost))}<span className="block mt-0.5">each</span></span></div>;
                })}</div>
              </section>
              {(() => {
                const invoiceTotal = viewingOrder.invoices?.reduce((sum, invoice) => sum + n(invoice.totalAmount), 0) ?? 0;
                const paidTotal = viewingOrder.invoices?.reduce((sum, invoice) => sum + invoice.allocations.filter((allocation) => allocation.payment.status === "SUCCEEDED").reduce((paid, allocation) => paid + n(allocation.amount), 0), 0) ?? 0;
                const orderTotal = viewingOrder.lines.reduce((sum, line) => sum + n(line.orderedQuantity) * n(line.unitCost), 0);
                return isOwner ? <div className="grid grid-cols-3 gap-2 max-[480px]:grid-cols-1">{[["Order total", invoiceTotal || orderTotal], ["Paid", paidTotal], ["Balance left", Math.max(0, invoiceTotal - paidTotal)]].map(([label, amount]) => <div key={label} className="rounded-lg bg-[#f7f9f7] p-3"><span className="block text-[11px] text-[#89948b]">{label}</span><strong className="mt-1 block text-sm font-semibold tabular-nums text-[#34463a]">{money(Number(amount))}</strong></div>)}</div> : null;
              })()}
              <div className="flex flex-wrap justify-end gap-2 border-t border-[#edf1ed] pt-4">
                {user.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF" && viewingOrder.status === "DRAFT" && <button type="button" className="h-9 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#4e5e54] hover:bg-[#f8faf8]" disabled={busy === viewingOrder.id} onClick={() => { const order = viewingOrder; setViewingOrder(null); void submitAction(order.id, "submit"); }}>Send for approval</button>}
                {user.role === "OWNER" && viewingOrder.status === "SUBMITTED" && <button type="button" className="h-9 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#4e5e54] hover:bg-[#f8faf8]" disabled={busy === viewingOrder.id} onClick={() => { const order = viewingOrder; setViewingOrder(null); void submitAction(order.id, "approve"); }}>Approve</button>}
                {canManage && ["APPROVED", "PARTIALLY_RECEIVED"].includes(viewingOrder.status) && <button type="button" className="h-9 rounded-lg border border-brand bg-brand px-3 text-sm text-white hover:bg-brand-dark" onClick={() => { const order = viewingOrder; setViewingOrder(null); void receiveOrder(order); }}>Record items received</button>}
                <button type="button" className="h-9 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#4e5e54] hover:bg-[#f8faf8]" onClick={() => setViewingOrder(null)}>Close</button>
              </div>
            </div>
          </AdminDialogPanel>
        </div>
      ), document.body)}
      <AppErrorModal message={actionError} onClose={() => setActionError("")} title="Purchasing action could not be completed" />
    </div>
  );
}
