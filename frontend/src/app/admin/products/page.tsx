"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { statusPill } from "@/lib/ui";
import { useProducts } from "@/hooks/queries/use-products";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useUpdateProductState } from "@/hooks/mutations/use-product-mutations";
import type { Product } from "@/services/products/product.service";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminPageSkeleton, AdminTableSkeleton } from "@/components/admin-loading-skeleton";
import { AdminDialogPanel } from "@/components/admin-motion";
import { AppErrorModal } from "@/components/app-error-modal";
import { FourDotLoader } from "@/components/four-dot-loader";

type Role = "OWNER" | "STAFF";
type User = { id: string; name: string; email: string; role: Role; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null };
type StockFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
const canManage = (user: User | null) =>
  user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");
const currency = (amount: number | string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(Number(amount));
const quantity = (value: number) =>
  new Intl.NumberFormat("en-NG", { maximumFractionDigits: 2 }).format(value);

function available(product: Product) {
  return product.balances.reduce(
    (total, balance) =>
      total + Number(balance.onHand) - Number(balance.reserved),
    0,
  );
}
function stockState(product: Product) {
  const total = available(product);
  if (total <= 0) return "OUT_OF_STOCK";
  if (total <= Number(product.reorderLevel)) return "LOW_STOCK";
  return "IN_STOCK";
}

export default function ProductsPage() {
  const userQuery = useCurrentUser();
  const user = (userQuery.data?.user as User | undefined) ?? null;
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("ALL");
  const [category, setCategory] = useState("ALL");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [productBusy, setProductBusy] = useState("");
  const [viewingProduct, setViewingProduct] = useState<Product | null>(null);
  const productsQuery = useProducts(search);
  const updateState = useUpdateProductState();
  const products = productsQuery.data?.data ?? [];
  const loading = productsQuery.isLoading;
  const error = productsQuery.error instanceof Error
    ? productsQuery.error.message
    : productsQuery.isError
      ? "Products could not be loaded."
      : "";

  useEffect(() => {
    if (!user) return;
    const visibility = window.sessionStorage.getItem("oceanic-product-created");
    if (visibility) {
      setNotice(visibility === "draft"
        ? "Product saved as a draft. It is hidden from customers."
        : "Product saved and published on your website.");
      window.sessionStorage.removeItem("oceanic-product-created");
    }
  }, [user]);

  useEffect(() => setPage(1), [search]);

  const categories = useMemo(
    () =>
      [...new Set(products.map((product) => product.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [products],
  );
  const filtered = useMemo(
    () =>
      products.filter(
        (product) =>
          (stockFilter === "ALL" || stockState(product) === stockFilter) &&
          (category === "ALL" || product.category === category),
      ),
    [products, stockFilter, category],
  );
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visibleProducts = filtered.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );
  const summary = useMemo(
    () => ({
      total: products.length,
      inStock: products.filter((product) => stockState(product) === "IN_STOCK")
        .length,
      low: products.filter((product) => stockState(product) === "LOW_STOCK")
        .length,
      empty: products.filter(
        (product) => stockState(product) === "OUT_OF_STOCK",
      ).length,
    }),
    [products],
  );

  async function changeProductState(product: Product) {
    const nextState = product.state === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    setProductBusy(product.id);
    setActionError("");
    setNotice("");
    try {
      await updateState.mutateAsync({ id: product.id, state: nextState });
      setNotice(`${product.name} is now ${nextState.toLowerCase()}.`);
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Product state could not be changed.",
      );
    } finally {
      setProductBusy("");
    }
  }

  if (!user)
    return <AdminPageSkeleton />;

  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">
                PRODUCT MANAGEMENT
              </span>
              <h1>Products</h1>
              <p>Manage your catalogue, pricing and stock health.</p>
            </div>
            {canManage(user) && (
              <div className="flex gap-2">
                {user.role === "OWNER" && <Link href="/admin/products/merge" className="h-[35px] cursor-pointer px-3 inline-flex items-center rounded-lg border border-line bg-white text-sm">Merge duplicates</Link>}
                <Link href="/admin/products/import" className="h-[35px] cursor-pointer px-3 inline-flex items-center rounded-lg border border-line bg-white text-sm">Import</Link>
                <Link href="/admin/products/new" className="h-[35px] cursor-pointer px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm text-white bg-brand border border-brand">Add product</Link>
              </div>
            )}
          </div>
          {notice && (
            <div
              className="mb-3 border border-[#dcebe0] bg-[#f1f8f3] rounded-lg py-2.5 px-3 text-[#4b7557] text-sm flex items-center justify-between gap-3 [&_button]:[border:0] [&_button]:bg-transparent [&_button]:text-inherit [&_button]:text-[15px]"
              role="status"
            >
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss notification"
                title="Dismiss"
                className="grid size-7 cursor-pointer place-items-center rounded-md hover:bg-white"
              ><AdminUiIcon name="close" size={14} /></button>
            </div>
          )}
          <section
            className="grid grid-cols-4 gap-3 mb-4 max-[620px]:grid-cols-2 max-[620px]:gap-2"
            aria-label="Product summary"
          >
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>Catalogue items</span>
              <strong>
                {loading && !products.length ? "" : summary.total}
              </strong>
              <small>Products in this business</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl">
              <span>In stock</span>
              <strong>
                {loading && !products.length ? "" : summary.inStock}
              </strong>
              <small>Above reorder level</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#a6782c]">
              <span>Low stock</span>
              <strong>{loading && !products.length ? "" : summary.low}</strong>
              <small>At or below reorder level</small>
            </article>
            <article className="bg-white border border-line rounded-xl p-4 grid gap-1.5 min-h-[106px] [&>span]:text-sm [&>span]:text-[#75827a] [&>span]:font-normal [&>strong]:text-2xl [&>strong]:leading-none [&>strong]:font-normal [&>strong]:tracking-tight [&>strong]:text-[#26372d] [&>small]:text-sm [&>small]:text-[#9aa49d] max-[620px]:min-h-[91px] max-[620px]:p-3 max-[620px]:[&>strong]:text-xl [&>strong]:text-[#ad5b4d]">
              <span>Out of stock</span>
              <strong>
                {loading && !products.length ? "" : summary.empty}
              </strong>
              <small>No available units</small>
            </article>
          </section>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-[#edf1ed] px-5 py-4 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:px-4">
              <div>
                <h2 className="m-0 text-sm font-semibold text-ink">
                  All products
                </h2>
                <p className="mb-0 mt-1 text-xs text-muted">
                  {filtered.length} shown
                  {products.length === 100
                    ? "  maximum 100 results; refine your search for more"
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2 max-[1000px]:w-full max-[1000px]:flex-wrap max-[620px]:gap-2">
                <label className="flex h-10 w-64 items-center gap-2 rounded-lg border border-[#e0e7e1] bg-white px-3 text-muted focus-within:border-brand max-[1000px]:flex-1 max-[1000px]:min-w-[190px] max-[620px]:w-full max-[620px]:flex-none">
                  <span aria-hidden="true" className="grid place-items-center">
                    <AdminUiIcon name="search" size={17} />
                  </span>
                  <input
                    className="min-w-0 flex-1 border-0 bg-transparent text-xs text-ink outline-none placeholder:text-[#9aa49d]"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setSearch(event.target.value.trim());
                    }}
                    placeholder="Search name, SKU or barcode"
                    aria-label="Search products"
                  />
                </label>
                <select
                  value={stockFilter}
                  onChange={(event) => {
                    setStockFilter(event.target.value as StockFilter);
                    setPage(1);
                  }}
                  aria-label="Filter by stock status"
                  className="h-10 min-w-40 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#46564c] outline-none focus:border-brand max-[1000px]:flex-1"
                >
                  <option value="ALL">All stock status</option>
                  <option value="IN_STOCK">In stock</option>
                  <option value="LOW_STOCK">Low stock</option>
                  <option value="OUT_OF_STOCK">Out of stock</option>
                </select>
                <select
                  value={category}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setPage(1);
                  }}
                  aria-label="Filter by category"
                  className="h-10 min-w-40 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#46564c] outline-none focus:border-brand max-[1000px]:flex-1"
                >
                  <option value="ALL">All categories</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {error ? (
              <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55] [&_strong]:text-[#a5554a] [&_p]:text-[#8e7974]">
                <strong>Catalogue unavailable</strong>
                <p>{error}</p>
                <button
                  className="h-[35px] cursor-pointer px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                  onClick={() => void productsQuery.refetch()}
                >
                  Try again
                </button>
              </div>
            ) : loading && !products.length ? (
              <AdminTableSkeleton columns={5} rows={6} />
            ) : visibleProducts.length === 0 ? (
              <AdminEmptyState
                icon="box"
                title={search || stockFilter !== "ALL" || category !== "ALL" ? "No matching products" : "Your catalogue is empty"}
                description={search || stockFilter !== "ALL" || category !== "ALL" ? "Try changing your search or filters." : canManage(user) ? "Add your first product to start tracking stock and sales." : "Products added to your business will appear here."}
                action={canManage(user) && !products.length ? <Link href="/admin/products/new" className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-3 text-sm text-white transition-colors hover:bg-brand-dark">Add product</Link> : undefined}
              />
            ) : (
              <>
                <div className="w-full overflow-hidden">
                  <table className="w-full table-fixed border-collapse text-left">
                    <colgroup>
                      <col className="w-[22%] max-[760px]:w-[40%] max-[520px]:w-[44%]" />
                      <col className="w-[12.5%] max-[760px]:hidden" />
                      <col className="w-[12.5%] max-[760px]:w-1/5 max-[520px]:hidden" />
                      <col className="w-[15.5%] max-[760px]:w-1/5 max-[520px]:w-[28%]" />
                      <col className="w-[12.5%] max-[760px]:hidden" />
                      <col className="w-[12.5%] max-[760px]:hidden" />
                      <col className="w-[12.5%] max-[760px]:w-1/5 max-[520px]:w-[28%]" />
                    </colgroup>
                    <thead>
                      <tr className="h-10 border-b border-[#e9eeea] bg-[#f8faf8] text-[10px] font-medium uppercase tracking-wide text-[#78857d]">
                        <th className="px-2">Product</th>
                        <th className="px-2 max-[760px]:hidden">Category</th>
                        <th className="px-2 text-right max-[520px]:hidden">Available</th>
                        <th className="whitespace-nowrap px-2 text-right">Selling price</th>
                        <th className="px-2 max-[760px]:hidden">Stock</th>
                        <th className="px-2 max-[760px]:hidden">Product state</th>
                        <th className="px-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => {
                        const stock = stockState(product);
                        const availableUnits = available(product);
                        return (
                          <tr
                            key={product.id}
                            className="h-12 border-b border-[#edf1ed] text-xs text-[#536159] transition-colors last:border-0 hover:bg-[#fbfdfb]"
                          >
                            <td className="overflow-hidden px-2 py-2">
                              <div className="flex min-w-0 items-center gap-2">
                                {product.imageUrl ? (
                                  <img src={product.imageUrl} alt="" width={32} height={32} className="size-8 shrink-0 rounded-md border border-line bg-canvas object-cover" />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="grid size-8 shrink-0 place-items-center rounded-md bg-[#edf4ef] text-brand"
                                  >
                                    <AdminUiIcon name="box" size={15} />
                                  </span>
                                )}
                                <strong title={`${product.name} · ${product.unit}`} className="min-w-0 truncate whitespace-nowrap text-xs font-semibold text-[#26372d]">{product.name}</strong>
                              </div>
                            </td>
                            <td className="max-w-0 truncate whitespace-nowrap px-2 py-2 max-[760px]:hidden" title={`${product.category}${product.subcategory ? ` · ${product.subcategory}` : ""}`}>
                              <span className="text-xs font-medium text-[#397853]">{product.category}</span>{product.subcategory && <small className="ml-1 text-[10px] text-muted">· {product.subcategory}</small>}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right max-[520px]:hidden">
                              <strong className="font-semibold tabular-nums text-[#26372d]">
                                {quantity(availableUnits)}{" "}
                                <span className="text-[10px] font-normal text-muted">
                                  {product.unit}
                                </span>
                              </strong>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right">
                              <strong title={`Selling price ${currency(product.sellingPrice)}`} className="inline-block whitespace-nowrap font-medium tabular-nums text-[#26372d]">
                                {currency(product.sellingPrice)}
                              </strong>
                            </td>
                            <td className="px-2 py-2 max-[760px]:hidden">
                              <span className={statusPill(stock.toLowerCase())}>
                                {stock === "IN_STOCK"
                                  ? "In stock"
                                  : stock === "LOW_STOCK"
                                    ? "Low stock"
                                    : "Out of stock"}
                              </span>
                            </td>
                            <td className="px-2 py-2 max-[760px]:hidden">
                              <span
                                className={statusPill(
                                  product.state.toLowerCase(),
                                )}
                              >
                                {product.state.toLowerCase()}
                              </span>
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-end gap-1">
                                <button type="button" aria-label={`View ${product.name} details`} title="View details" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#dce8f2] bg-[#f3f8fc] text-[#478264] transition-colors hover:bg-[#e4eff8] hover:text-[#32674f]" onClick={() => setViewingProduct(product)}><AdminUiIcon name="eye" size={15} /></button>
                                {canManage(user) && <>
                                  <Link
                                    aria-label={`Edit ${product.name}`}
                                    title="Edit product"
                                    className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border border-[#dcebe0] bg-[#f3f8f4] text-brand transition-colors hover:bg-[#e4f1e7] hover:text-brand-dark"
                                    href={`/admin/products/${product.id}/edit`}
                                  >
                                    <AdminUiIcon name="edit" size={14} />
                                  </Link>
                                  {product.state !== "ARCHIVED" && (
                                    <button
                                      aria-label={`${product.state === "ACTIVE" ? "Deactivate" : "Activate"} ${product.name}`}
                                      title={product.state === "ACTIVE" ? "Deactivate product" : "Activate product"}
                                      className={`grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border transition-colors disabled:cursor-wait ${product.state === "ACTIVE" ? "border-[#f0dfda] bg-[#fff6f3] text-[#ab6255] hover:bg-[#ffe9e4]" : "border-[#dcebe0] bg-[#f3f8f4] text-brand hover:bg-[#e4f1e7]"}`}
                                      disabled={productBusy === product.id}
                                      onClick={() =>
                                        void changeProductState(product)
                                      }
                                    >
                                      {productBusy === product.id ? (
                                        <span className="inline-flex items-center gap-2">
                                          <FourDotLoader />
                                        </span>
                                      ) : product.state === "ACTIVE" ? (
                                        <AdminUiIcon name="minus" size={15} />
                                      ) : (
                                        <AdminUiIcon name="check" size={15} />
                                      )}
                                    </button>
                                  )}
                                </>}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="min-h-[54px] [border-top:1px_solid_#edf1ed] py-[9px] px-[17px] flex items-center justify-between text-[#89958d] text-sm [&>div]:flex [&>div]:items-center [&>div]:gap-2.5 [&_.button-secondary]:h-[29px] [&_.button-secondary]:py-0 px-[9px] [&_.button-secondary]:text-sm max-[620px]:items-start max-[620px]:gap-2 max-[620px]:flex-col max-[620px]:[&>div]:w-full max-[620px]:[&>div]:justify-between">
                  <span>
                    Showing {(page - 1) * pageSize + 1}
                    {Math.min(page * pageSize, filtered.length)} of{" "}
                    {filtered.length}
                  </span>
                  <div>
                    <button
                      className="h-[35px] cursor-pointer px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce] disabled:cursor-wait"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {page} of {pageCount}
                    </span>
                    <button
                      className="h-[35px] cursor-pointer px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce] disabled:cursor-wait"
                      disabled={page >= pageCount}
                      onClick={() => setPage(page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Product catalogue</span>
            <span>Stock is available quantity after active reservations.</span>
          </footer>
        </div>
      </main>
      {viewingProduct && createPortal(<div className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 [backdrop-filter:blur(2px)]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingProduct(null); }}>
        <AdminDialogPanel role="dialog" aria-modal="true" aria-labelledby="view-product-title" onEscape={() => setViewingProduct(null)} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-[720px] overflow-y-auto rounded-2xl border border-line bg-white p-5 shadow-[0_24px_70px_#17251f42] max-[620px]:p-4">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-[#2a6a51]"><AdminUiIcon name="eye" size={19} /></span><div className="min-w-0"><p className="mb-1 mt-0 text-[10px] font-medium tracking-wide text-[#718b79]">PRODUCT DETAILS</p><h2 id="view-product-title" className="m-0 truncate text-base font-semibold tracking-[-.3px] text-ink">{viewingProduct.name}</h2><p className="mb-0 mt-1 text-sm text-[#89948b]">{viewingProduct.sku} · per {viewingProduct.unit}</p></div></div>
            <button type="button" aria-label="Close product details" className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg border-0 bg-transparent text-[#76837b] transition-colors hover:bg-[#f1f6f2] hover:text-[#28644c]" onClick={() => setViewingProduct(null)}><AdminUiIcon name="close" size={15} /></button>
          </div>
          <div className="space-y-4">
            <div className="grid gap-4 rounded-xl border border-[#e8ede9] bg-white p-4 sm:grid-cols-[160px_minmax(0,1fr)]">
              <div className="flex items-start gap-3 sm:grid sm:content-start">
                {viewingProduct.imageUrl ? <img src={viewingProduct.imageUrl} alt={viewingProduct.name} className="size-24 shrink-0 rounded-xl border border-line bg-canvas object-cover sm:size-40" /> : <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-[#edf4ef] text-brand sm:size-40"><AdminUiIcon name="box" size={30} /></div>}
                {!!viewingProduct.productImages?.length && <div className="flex flex-wrap gap-2 sm:grid sm:grid-cols-3">{viewingProduct.productImages.map((image) => image.mediaAsset.secureUrl && <img key={image.id} src={image.mediaAsset.secureUrl} alt={`${viewingProduct.name} ${image.view.toLowerCase()} view`} title={`${image.view.toLowerCase()} image`} className="size-12 rounded-lg border border-line bg-canvas object-cover" />)}</div>}
              </div>
              <div className="grid min-w-0 grid-cols-2 content-start gap-2.5 text-sm sm:grid-cols-3 [&>div]:min-w-0 [&>div]:rounded-lg [&>div]:bg-[#f7f9f7] [&>div]:px-3 [&>div]:py-2.5 max-[480px]:grid-cols-1">
                <div><span className="block text-xs text-muted">SKU</span><strong className="font-medium text-ink">{viewingProduct.sku}</strong></div>
                <div><span className="block text-xs text-muted">Category</span><strong className="font-medium text-ink">{viewingProduct.category}{viewingProduct.subcategory ? ` · ${viewingProduct.subcategory}` : ""}</strong></div>
                <div><span className="block text-xs text-muted">Barcode</span><strong className="font-medium text-ink">{viewingProduct.barcode || "Not set"}</strong></div>
                <div><span className="block text-xs text-muted">Brand / model</span><strong className="font-medium text-ink">{[viewingProduct.brand, viewingProduct.model].filter(Boolean).join(" · ") || "Not set"}</strong></div>
                <div><span className="block text-xs text-muted">Product state</span><span className={statusPill(viewingProduct.state.toLowerCase())}>{viewingProduct.state.toLowerCase()}</span></div>
                <div><span className="block text-xs text-muted">Public store</span><strong className="font-medium text-ink">{viewingProduct.isPublished ? "Published" : "Hidden"}</strong></div>
              </div>
            </div>
            {viewingProduct.description && <section className="rounded-xl border border-[#e8ede9] p-4 sm:p-5"><h3 className="mb-2 mt-0 text-sm font-semibold text-ink">Description</h3><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-[#536159]">{viewingProduct.description}</p></section>}
            <section className="rounded-xl border border-[#e8ede9] p-4 sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><div><h3 className="m-0 text-sm font-semibold text-ink">Pricing and stock</h3><p className="mb-0 mt-1 text-xs text-muted">Stock totals across all branches.</p></div><span className="text-xs text-muted">Unit: {viewingProduct.unit}</span></div><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[["Selling price", currency(viewingProduct.sellingPrice)], ["Cost price", currency(viewingProduct.costPrice ?? 0)], ["Available", `${quantity(available(viewingProduct))} ${viewingProduct.unit}`], ["Reorder at", `${quantity(Number(viewingProduct.reorderLevel))} ${viewingProduct.unit}`]].map(([label, value]) => <div key={label} className="rounded-lg bg-[#f7f9f7] p-3"><span className="block text-[11px] text-muted">{label}</span><strong className="mt-1 block text-sm font-semibold text-ink">{value}</strong></div>)}
            </div></section>
            {viewingProduct.balances.length > 0 && <section className="rounded-xl border border-[#e8ede9] p-4 sm:p-5"><h3 className="mb-3 mt-0 text-sm font-semibold text-ink">Branch stock</h3><div className="grid gap-2">{viewingProduct.balances.map((balance) => <div key={balance.branchId} className="grid grid-cols-2 gap-2 rounded-lg bg-[#f7f9f7] px-3 py-3 text-xs sm:grid-cols-4"><strong className="col-span-2 font-medium text-[#35453b] sm:col-span-1">{balance.branch?.name ?? "Branch"}</strong><span>On hand <strong>{quantity(Number(balance.onHand))}</strong></span><span>Reserved <strong>{quantity(Number(balance.reserved))}</strong></span><span>Available <strong>{quantity(Number(balance.onHand) - Number(balance.reserved))}</strong></span></div>)}</div></section>}
            {!!viewingProduct.specifications?.length && <section className="rounded-xl border border-[#e8ede9] p-4 sm:p-5"><h3 className="mb-3 mt-0 text-sm font-semibold text-ink">Specifications</h3><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{viewingProduct.specifications.map((spec) => <div key={spec.id} className="flex justify-between gap-3 rounded-lg bg-[#f7f9f7] px-3 py-2.5 text-xs"><span className="text-muted">{spec.name}</span><strong className="text-right font-medium text-ink">{spec.value}</strong></div>)}</div></section>}
          </div>
          <footer className="mt-4 flex justify-end gap-2 border-t border-line pt-4"><button type="button" className="h-[35px] cursor-pointer rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#4e5e54] transition-colors hover:border-[#ccd9ce] hover:bg-[#f8faf8]" onClick={() => setViewingProduct(null)}>Close</button>{canManage(user) && <Link href={`/admin/products/${viewingProduct.id}/edit`} className="inline-flex h-[35px] items-center gap-2 rounded-lg border border-brand bg-brand px-3 text-sm text-white hover:bg-brand-dark"><AdminUiIcon name="edit" size={14} />Edit product</Link>}</footer>
        </AdminDialogPanel>
      </div>, document.body)}
      <AppErrorModal message={actionError} onClose={() => setActionError("")} title="Product update could not be completed" />
    </div>
  );
}
