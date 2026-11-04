"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { usePosCartStore } from "@/stores/pos-cart.store";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { useBranches } from "@/hooks/queries/use-branches";
import { useCustomers } from "@/hooks/queries/use-customers";
import { useProducts } from "@/hooks/queries/use-products";
import { useSalesWorkspace } from "@/hooks/queries/use-sales-workspace";
import { useBranchStore } from "@/stores/branch.store";
import {
  approveSaleRefund,
  closeCashShift,
  createPosSale,
  createSaleReturn,
  openCashShift,
  salesKeys,
} from "@/services/sales/sales.service";

type User = { id: string; name: string; email: string; role: string };
type Branch = { id: string; name: string; isDefault: boolean };
type Product = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number | string;
  state: string;
  balances: {
    branchId: string;
    onHand: number | string;
    reserved: number | string;
  }[];
};
type Customer = {
  id: string;
  name: string;
  phone?: string | null;
  creditLimit?: number | string | null;
};
type SaleLine = {
  id: string;
  productId: string;
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
};
type Sale = {
  id: string;
  number: string;
  status: string;
  channel: string;
  total: number | string;
  createdAt: string;
  customer?: { name: string } | null;
  user?: { name: string };
  lines: SaleLine[];
};
type RefundRequest = { id: string; reference: string; saleNumber: string };
type Shift = {
  id: string;
  branchId: string;
  openingCash: number | string;
  openedAt: string;
  sales?: unknown[];
} | null;
const fmtMoney = (value: number) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
const fmtDate = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
const posRoles = (role?: string) => role === "OWNER" || role === "STAFF";

export default function SalesPage() {
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const queryClient = useQueryClient();
  const branchesQuery = useBranches<Branch>();
  const customersQuery = useCustomers<Customer>();
  const productsQuery = useProducts("");
  const branches = branchesQuery.data?.data ?? [];
  const customers = customersQuery.data?.data ?? [];
  const branchId = useBranchStore((state) => state.selectedBranchId);
  const setBranchId = useBranchStore((state) => state.setSelectedBranchId);
  const salesQuery = useSalesWorkspace<Sale, NonNullable<Shift>>(
    branchId,
    posRoles(user?.role),
    Boolean(user && (branchId || branches.length === 0)),
  );
  const products = (productsQuery.data?.data ?? []).filter((product) => product.state === "ACTIVE") as Product[];
  const sales = salesQuery.data?.sales ?? [];
  const [refundRequests, setRefundRequests] = useState<RefundRequest[]>([]);
  const shift = salesQuery.data?.shift ?? null;
  const cart = usePosCartStore((state) => state.items);
  const addCartProduct = usePosCartStore((state) => state.addProduct);
  const adjustCartQuantity = usePosCartStore((state) => state.adjustQuantity);
  const clearCart = usePosCartStore((state) => state.clearCart);
  const [search, setSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    "CASH" | "BANK_TRANSFER" | "CARD" | "OTHER"
  >("CASH");
  const loading = salesQuery.isLoading;
  const [busy, setBusy] = useState(false);
  const [refundBusy, setRefundBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const pageError = error || (salesQuery.error instanceof Error
    ? salesQuery.error.message
    : customersQuery.error instanceof Error
      ? customersQuery.error.message
      : "");

  const loadOperational = useCallback(async () => {
    setError("");
    await salesQuery.refetch();
  }, [salesQuery.refetch]);

  useEffect(() => {
    if (branchId || !branches.length) return;
    setBranchId(
      branches.find((branch) => branch.isDefault)?.id ?? branches[0]?.id ?? "",
    );
  }, [branchId, branches]);
  const availableProducts = useMemo(
    () =>
      products.filter((product) => {
        const matches = `${product.name} ${product.sku}`
          .toLowerCase()
          .includes(search.toLowerCase());
        const balance = product.balances.find(
          (row) => row.branchId === branchId,
        );
        return (
          matches &&
          Number(balance?.onHand ?? 0) - Number(balance?.reserved ?? 0) > 0
        );
      }),
    [products, search, branchId],
  );
  const subtotal = cart.reduce(
    (sum, row) => sum + Number(row.product.sellingPrice) * row.quantity,
    0,
  );
  const total = Math.max(0, subtotal - discount + tax);

  function addProduct(product: Product) {
    addCartProduct(product, branchId);
  }
  function adjust(productId: string, amount: number) {
    adjustCartQuantity(productId, amount);
  }
  async function shiftOpen(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await openCashShift({
        branchId: form.get("branchId"),
        openingCash: Number(form.get("openingCash")),
      });
      setNotice("Cash shift opened.");
      await invalidateAdminSummaries(queryClient);
      await loadOperational();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open the shift.");
    } finally {
      setBusy(false);
    }
  }
  async function closeShift(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shift) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await closeCashShift<{ variance: number}>(
        shift.id,
        Number(form.get("closingCash")),
      );
      setNotice(`Shift closed. Cash variance: ${fmtMoney(result.variance)}.`);
      await invalidateAdminSummaries(queryClient);
      await loadOperational();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close the shift.");
    } finally {
      setBusy(false);
    }
  }
  async function checkout() {
    if (!cart.length || !branchId) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payments = [{ method: paymentMethod, amount: total }];
      const result = await createPosSale<Sale>({
          branchId,
          customerId: customerId || undefined,
          cashShiftId: paymentMethod === "CASH" ? shift?.id : undefined,
          discount,
          tax,
          channel: "POS",
          lines: cart.map((row) => ({
            productId: row.product.id,
            quantity: row.quantity,
          })),
          payments,
        }, crypto.randomUUID());
      setNotice(`Sale ${result.data.number} recorded successfully.`);
      clearCart();
      setDiscount(0);
      setTax(0);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: salesKeys.all }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
        queryClient.invalidateQueries({ queryKey: ["inventory"] }),
        invalidateAdminSummaries(queryClient),
      ]);
      await loadOperational();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sale could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  async function recordReturn(
    event: React.FormEvent<HTMLFormElement>,
    sale: Sale,
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await createSaleReturn<{
        data: {
          return: { id: string; reference: string };
          refund: { id: string } | null;
        };
      }>(sale.id, {
          reason: form.get("reason"),
          method: form.get("method"),
          lines: [
            {
              saleLineId: form.get("saleLineId"),
              quantity: Number(form.get("quantity")),
              restock: form.get("restock") === "on",
            },
          ],
      });
      if (result.data.refund)
        setRefundRequests((current) => [
          ...current,
          {
            id: result.data.return.id,
            reference: result.data.return.reference,
            saleNumber: sale.number,
          },
        ]);
      setNotice(
        `Return ${result.data.return.reference} recorded${result.data.refund ? "; refund is pending owner approval" : ""}.`,
      );
      await invalidateAdminSummaries(queryClient);
      await loadOperational();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Return could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function approveRefund(request: RefundRequest) {
    setRefundBusy(request.id);
    setError("");
    setNotice("");
    try {
      await approveSaleRefund(request.id);
      await Promise.all([queryClient.invalidateQueries({ queryKey: salesKeys.all }), invalidateAdminSummaries(queryClient)]);
      setRefundRequests((current) =>
        current.filter((item) => item.id !== request.id),
      );
      setNotice(`Refund for ${request.saleNumber} approved.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refund approval failed.");
    } finally {
      setRefundBusy("");
    }
  }

  if (!user)
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-2.5 text-[#718077] text-sm">
        <span className="h-[35px] w-[35px] rounded-[10px] bg-brand text-white grid [place-items:center] font-normal">
          O
        </span>
        <span>Loading sales</span>
      </main>
    );
  const canPos = posRoles(user.role);
  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">
                POINT OF SALE
              </span>
              <h1>Sales</h1>
              <p>Sell items. The system checks prices and stock for you.</p>
            </div>
            <label className="flex items-center gap-2 [&>span]:text-sm [&>span]:text-[#919b95] [&_select]:h-[30px] [&_select]:border border-[#e4e9e4] [&_select]:rounded-md [&_select]:bg-white [&_select]:text-[#3e4e45] [&_select]:py-0 px-2 [&_select]:text-sm [&_select]:[outline:0] [&_select:focus]:[border-color:#73a48a] [&_select:focus]:shadow-[0_0_0_2px_#eaf3ec] max-[620px]:[flex:1] max-[620px]:grid max-[620px]:gap-1 max-[620px]:[&_select]:w-full flex items-center gap-2 text-[#77847b] text-sm [&_select]:h-[34px] [&_select]:max-w-[200px] [&_select]:border border-[#e1e8e2] [&_select]:rounded-md [&_select]:bg-white [&_select]:py-0 px-[9px] [&_select]:text-[#435249] [&_select]:text-sm max-[620px]:[&_select]:max-w-[135px] max-[620px]:[&_select]:h-[31px] max-[620px]:[&_select]:text-sm">
              Branch
              <select
                value={branchId}
                disabled={!!shift}
                onChange={(event) => setBranchId(event.target.value)}
              >
                <option value="">Select branch</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {pageError && (
            <div
              className="[&_strong]:text-[#a5554a] [&_p]:text-[#8e7974] m-0 text-[#b44f44] text-sm leading-normal"
              role="alert"
            >
              {pageError}
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
          {canPos && (
            <section className="flex justify-between items-center gap-[15px] py-[13px] px-4 mb-3 bg-white border border-line rounded-lg [&>div]:grid [&>div]:gap-1 [&>div_strong]:text-sm [&>div_strong]:text-[#385844] [&>div_small]:text-sm [&>div_small]:text-[#89958d] [&_form]:flex [&_form]:items-end [&_form]:gap-2 [&_label]:grid [&_label]:gap-1 [&_label]:text-[#75827a] [&_label]:text-sm [&_input]:h-[32px] [&_input]:[min-width:130px] [&_input]:border border-[#e2e9e3] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-[#425148] [&_input]:text-sm [&_button]:h-[32px] [&_button]:px-2.5 [&_button]:text-sm max-[620px]:items-stretch max-[620px]:flex-col max-[620px]:[&_form]:items-stretch max-[620px]:[&_form]:[flex-wrap:wrap] max-[620px]:[&_label]:[flex:1] max-[620px]:[&_input]:w-full">
              <div>
                <strong>
                  {shift ? "Cash shift is open" : "No cashier shift is open"}
                </strong>
                <small>
                  {shift
                    ? `Opened ${fmtDate(shift.openedAt)}  opening cash ${fmtMoney(Number(shift.openingCash))}`
                    : "Cash payments require an open cashier shift."}
                </small>
              </div>
              {!shift ? (
                <form onSubmit={(event) => void shiftOpen(event)}>
                  <input type="hidden" name="branchId" value={branchId} />
                  <label>
                    Opening cash
                    <input
                      name="openingCash"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue="0"
                      required
                    />
                  </label>
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                    disabled={busy || !branchId}
                  >
                    {busy ? "Opening" : "Open shift"}
                  </button>
                </form>
              ) : (
                <form onSubmit={(event) => void closeShift(event)}>
                  <label>
                    Counted cash
                    <input
                      name="closingCash"
                      type="number"
                      min="0"
                      step="0.01"
                      required
                      placeholder="Enter cash count"
                    />
                  </label>
                  <button
                    className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                    disabled={busy}
                  >
                    {busy ? "Closing" : "Close shift"}
                  </button>
                </form>
              )}
            </section>
          )}
          <div className="grid [grid-template-columns:minmax(0,1.7fr)_minmax(290px,.9fr)] gap-3 items-start mb-3 max-[950px]:grid-cols-1">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Choose items</h2>
                  <p>Active items available at the selected branch.</p>
                </div>
                <label className="h-[34px] w-[245px] flex items-center gap-2 border border-[#e4eae5] rounded-md py-0 px-2 text-[#859188] [&>span]:text-[17px] [&_input]:min-w-0 [&_input]:[flex:1] [&_input]:[border:0] [&_input]:[outline:0] [&_input]:bg-transparent [&_input]:text-sm [&_input]:text-[#344139] [&_input::placeholder]:text-[#a3ada5] [&_kbd]:py-0.5 px-1 [&_kbd]:border border-[#e7ebe7] [&_kbd]:rounded-[3px] [&_kbd]:text-[#a2aaa4] [&_kbd]:text-sm max-[1000px]:[flex:1] max-[1000px]:[min-width:190px] max-[620px]:[flex-basis:100%] max-[620px]:w-full">
                  <span>Search</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search products"
                    aria-label="Search products"
                  />
                </label>
              </div>
              <div className="p-3 grid grid-cols-3 gap-2 max-h-[530px] overflow-auto max-[950px]:grid-cols-4 max-[620px]:grid-cols-2 max-[620px]:p-2">
                {availableProducts.map((product) => (
                  <button
                    type="button"
                    className="min-h-[116px] flex flex-col items-start gap-1 text-left border border-[#e9eee9] rounded-lg bg-white p-2.5 text-[#35463b] [&:hover]:[border-color:#94b59d] [&:hover]:bg-[#fafffb] [&_strong]:text-sm [&_strong]:leading-[1.35] [&_small]:text-sm [&_small]:text-[#8e9a91] [&_b]:[margin-top:auto] [&_b]:text-sm [&_b]:text-[#28664e]"
                    key={product.id}
                    onClick={() => addProduct(product)}
                  >
                    <span className="w-[28px] h-[28px] grid [place-items:center] rounded-md bg-[#edf5ef] text-[#447758] text-sm font-normal">
                      {product.name[0]}
                    </span>
                    <strong>{product.name}</strong>
                    <small>{product.sku}</small>
                    <b>{fmtMoney(Number(product.sellingPrice))}</b>
                  </button>
                ))}
                {!availableProducts.length && (
                  <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55]">
                    No active products with available stock.
                  </div>
                )}
              </div>
            </section>
            {canPos ? (
              <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-3.5 sticky [top:12px] [&>.panel-heading]:mb-2 max-[950px]:[position:static]">
                <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                  <div>
                    <h2>Sale in progress</h2>
                    <p>{cart.length} product line(s)</p>
                  </div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[#38765a] text-sm font-normal [&:hover]:[text-decoration:underline]"
                    onClick={clearCart}
                    disabled={!cart.length}
                  >
                    Clear
                  </button>
                </div>
                <div className="max-h-[235px] overflow-auto">
                  {cart.map((row) => (
                    <article
                      className="flex items-center gap-2 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&>div:first-child]:grid [&>div:first-child]:gap-1 [&>div:first-child]:[flex:1] [&>div:first-child]:min-w-0 [&>div:first-child_strong]:text-sm [&>div:first-child_strong]:overflow-hidden [&>div:first-child_strong]:text-ellipsis [&>div:first-child_strong]:whitespace-nowrap [&>div:first-child_small]:text-sm [&>div:first-child_small]:text-[#929e96] [&>b]:text-sm [&>b]:whitespace-nowrap"
                      key={row.product.id}
                    >
                      <div>
                        <strong>{row.product.name}</strong>
                        <small>
                          {fmtMoney(Number(row.product.sellingPrice))} each
                        </small>
                      </div>
                      <div className="flex items-center gap-1 [&_button]:w-[22px] [&_button]:h-[22px] [&_button]:border border-[#e6ebe6] [&_button]:rounded-[5px] [&_button]:bg-white [&_button]:text-[#52645a] [&_span]:text-sm [&_span]:[min-width:12px] [&_span]:text-center">
                        <button
                          type="button"
                          onClick={() => adjust(row.product.id, -1)}
                          aria-label={`Remove one ${row.product.name}`}
                        >
                          -
                        </button>
                        <span>{row.quantity}</span>
                        <button
                          type="button"
                          onClick={() => adjust(row.product.id, 1)}
                          aria-label={`Add one ${row.product.name}`}
                        >
                          +
                        </button>
                      </div>
                      <b>
                        {fmtMoney(
                          Number(row.product.sellingPrice) * row.quantity,
                        )}
                      </b>
                    </article>
                  ))}
                  {!cart.length && (
                    <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                      Select products to start a sale.
                    </p>
                  )}
                </div>
                <div className="[&_label]:grid [&_label]:gap-1 [&_label]:text-[#75827a] [&_label]:text-sm [&_input]:h-[32px] [&_input]:[min-width:130px] [&_input]:border border-[#e2e9e3] [&_input]:rounded-[5px] [&_input]:py-0 px-2 [&_input]:bg-white [&_input]:text-[#425148] [&_input]:text-sm [&_select]:h-[32px] [&_select]:[min-width:130px] [&_select]:border border-[#e2e9e3] [&_select]:rounded-[5px] [&_select]:py-0 px-2 [&_select]:bg-white [&_select]:text-[#425148] [&_select]:text-sm grid gap-2 py-3 px-0 [&_select]:w-full [&_select]:min-w-0 [&_input]:w-full [&_input]:min-w-0 [&_.form-row]:gap-2">
                  <label>
                    Customer
                    <select
                      value={customerId}
                      onChange={(event) => setCustomerId(event.target.value)}
                    >
                      <option value="">Customer paying now</option>
                      {customers.map((customer) => (
                        <option value={customer.id} key={customer.id}>
                          {customer.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                    <label>
                      Discount
                      <input
                        type="number"
                        min="0"
                        max={subtotal}
                        step="0.01"
                        value={discount}
                        onChange={(event) =>
                          setDiscount(Math.max(0, Number(event.target.value)))
                        }
                      />
                    </label>
                    <label>
                      Tax
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={tax}
                        onChange={(event) =>
                          setTax(Math.max(0, Number(event.target.value)))
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Payment method
                    <select
                      value={paymentMethod}
                      onChange={(event) =>
                        setPaymentMethod(
                          event.target.value as typeof paymentMethod,
                        )
                      }
                    >
                      <option value="CASH">Cash</option>
                      <option value="BANK_TRANSFER">Bank transfer</option>
                      <option value="CARD">Card</option>
                      <option value="OTHER">Other</option>
                    </select>
                  </label>
                </div>
                <div className="grid [grid-template-columns:1fr_auto] gap-2 py-2.5 px-0 [border-top:1px_solid_#e9eee9] text-[#75827a] text-sm [&_strong]:text-sm [&_strong]:text-[#304138] [&_small]:[grid-column:1/-1] [&_small]:text-[#aa654f] [&_small]:text-sm">
                  <span>Subtotal</span>
                  <strong>{fmtMoney(subtotal)}</strong>
                  <span>Amount due</span>
                  <strong>{fmtMoney(total)}</strong>
                </div>
                <button
                  type="button"
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65] w-full h-[38px] text-sm"
                  disabled={
                    busy ||
                    !cart.length ||
                    !branchId ||
                    (paymentMethod === "CASH" && !shift)
                  }
                  onClick={() => void checkout()}
                >
                  {busy
                    ? "Processing sale..."
                    : `Complete sale | ${fmtMoney(total)}`}
                </button>
                {paymentMethod === "CASH" && !shift && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    Open a cashier shift before taking cash payments.
                  </p>
                )}
              </section>
            ) : null}
          </div>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden mb-3">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Recent sales</h2>
                <p>Latest transactions for the selected branch.</p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>SALE</th>
                    <th>DATE</th>
                    <th>CUSTOMER</th>
                    <th>ITEMS</th>
                    <th>CHANNEL</th>
                    <th>TOTAL</th>
                    <th>STATUS</th>
                    {canPos && <th>ACTIONS</th>}
                  </tr>
                </thead>
                <tbody>
                  {sales.map((sale) => (
                    <tr key={sale.id}>
                      <td>
                        <strong>{sale.number}</strong>
                      </td>
                      <td>{fmtDate(sale.createdAt)}</td>
                      <td>{sale.customer?.name || "Walk-in"}</td>
                      <td>
                        {sale.lines
                          .map(
                            (line) =>
                              `${line.productName}  ${Number(line.quantity)}`,
                          )
                          .join(", ")}
                      </td>
                      <td>{sale.channel.toLowerCase()}</td>
                      <td>
                        <strong>{fmtMoney(Number(sale.total))}</strong>
                      </td>
                      <td>
                        <span className="inline-flex py-1 px-[7px] rounded text-sm font-normal [text-transform:capitalize] bg-[#edf6ef] text-[#4d805a]">
                          {sale.status.toLowerCase().replaceAll("_", " ")}
                        </span>
                      </td>
                      {canPos && (
                        <td>
                          <details className="relative [&_summary]:[cursor:pointer] [&_summary]:text-[#356f53] [&_summary]:text-sm [&_summary]:font-normal [&[open]_form]:absolute [&[open]_form]:z-[12] [&[open]_form]:[right:0] [&[open]_form]:[top:20px] [&[open]_form]:w-[210px] [&[open]_form]:grid [&[open]_form]:gap-1.5 [&[open]_form]:p-2.5 [&[open]_form]:bg-white [&[open]_form]:border border-[#e3eae4] [&[open]_form]:rounded-lg [&[open]_form]:shadow-[0_8px_28px_#1c35231c] [&_form_input]:h-[29px] [&_form_input]:min-w-0 [&_form_input]:border border-[#e2e9e3] [&_form_input]:rounded [&_form_input]:py-0 px-1.5 [&_form_input]:bg-white [&_form_input]:text-[#526057] [&_form_input]:text-sm [&_form_select]:h-[29px] [&_form_select]:min-w-0 [&_form_select]:border border-[#e2e9e3] [&_form_select]:rounded [&_form_select]:py-0 px-1.5 [&_form_select]:bg-white [&_form_select]:text-[#526057] [&_form_select]:text-sm [&_form_.settings-checkbox]:text-sm [&_form_.button-secondary]:h-[28px] [&_form_.button-secondary]:py-0 px-[7px] [&_form_.button-secondary]:text-sm">
                            <summary>Return item</summary>
                            <form
                              onSubmit={(event) =>
                                void recordReturn(event, sale)
                              }
                            >
                              <select
                                name="saleLineId"
                                aria-label={`Item to return from ${sale.number}`}
                              >
                                {sale.lines.map((line) => (
                                  <option key={line.id} value={line.id}>
                                    {line.productName} ({line.quantity})
                                  </option>
                                ))}
                              </select>
                              <input
                                name="quantity"
                                type="number"
                                min="0.01"
                                step="0.01"
                                defaultValue="1"
                                required
                                aria-label="Return quantity"
                              />
                              <input
                                name="reason"
                                placeholder="Return reason"
                                required
                                minLength={3}
                                maxLength={500}
                              />
                              <select name="method" aria-label="Refund method">
                                <option value="OTHER">Other</option>
                                <option value="CASH">Cash</option>
                                <option value="BANK_TRANSFER">
                                  Bank transfer
                                </option>
                              </select>
                              <label className="flex items-center gap-2 text-sm text-[#637268] [&_input]:[accent-color:#286b51]">
                                <input
                                  name="restock"
                                  type="checkbox"
                                  defaultChecked
                                />{" "}
                                Restock returned item
                              </label>
                              <button
                                className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                                disabled={busy}
                              >
                                Record return
                              </button>
                            </form>
                          </details>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!sales.length && !loading && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No sales recorded for this branch yet.
              </p>
            )}
          </section>
          {(user.role === "OWNER" || user.role === "STAFF") && !!refundRequests.length && (
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
              <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
                <div>
                  <h2>Refunds to approve</h2>
                  <p>Approving a refund records the money returned.</p>
                </div>
              </div>
              <div className="py-[3px] px-[15px]">
                {refundRequests.map((request) => (
                  <article
                    className="min-h-[59px] flex items-center gap-2 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>div]:grid [&>div]:gap-1 [&>div]:min-w-0 [&>div]:[flex:1] [&>div_strong]:text-sm [&>div_strong]:text-[#3c4d42] [&>div_small]:text-sm [&>div_small]:text-[#909c94] [&>div_small]:leading-[1.4] [&>.button-primary]:h-[27px] [&>.button-primary]:py-0 px-2 [&>.button-primary]:text-sm [&>.button-primary]:whitespace-nowrap [&>.button-secondary]:h-[27px] [&>.button-secondary]:py-0 px-2 [&>.button-secondary]:text-sm [&>.button-secondary]:whitespace-nowrap max-[620px]:[flex-wrap:wrap] max-[620px]:py-2 px-0 max-[620px]:[&>div]:[flex-basis:100%] max-[620px]:[&>.catalogue-pill]:[margin-left:auto]"
                    key={request.id}
                  >
                    <div>
                      <strong>{request.reference}</strong>
                      <small>Sale {request.saleNumber}</small>
                    </div>
                    <button
                      className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                      disabled={refundBusy === request.id}
                      onClick={() => void approveRefund(request)}
                    >
                      {refundBusy === request.id
                        ? "Approving"
                        : "Approve refund"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>Oceanic Tools Sales</span>
            <span>Prices and stock are validated by the API at checkout.</span>
          </footer>
        </div>
      </main>
    </div>
  );
}
