"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { statusPill } from "@/lib/ui";
import { useProducts } from "@/hooks/queries/use-products";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useUpdateProductState } from "@/hooks/mutations/use-product-mutations";
import type { Product } from "@/services/products/product.service";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { FourDotLoader } from "@/components/four-dot-loader";

type Role = "OWNER" | "STAFF";
type User = { id: string; name: string; email: string; role: Role };
type StockFilter = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
const canManage = (role: Role) =>
  role === "OWNER" || role === "STAFF";
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
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-2.5 text-[#718077] text-sm">
        <span className="h-[35px] w-[35px] rounded-[10px] bg-brand text-white grid [place-items:center] font-normal">
          O
        </span>
        <span>Loading your catalogue</span>
      </main>
    );

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
            {canManage(user.role) && (
              <div className="flex gap-2">
                {user.role === "OWNER" && <Link href="/admin/products/merge" className="h-[35px] cursor-pointer px-3 inline-flex items-center rounded-lg border border-line bg-white text-sm">Merge duplicates</Link>}
                <Link href="/admin/products/import" className="h-[35px] cursor-pointer px-3 inline-flex items-center rounded-lg border border-line bg-white text-sm">Import</Link>
                <Link href="/admin/products/new" className="h-[35px] cursor-pointer px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm text-white bg-brand border border-brand">Add product</Link>
              </div>
            )}
          </div>
          {actionError && (
            <div
              className="mb-3 rounded-lg border border-[#f0d7d2] bg-[#fff3f0] px-3 py-2.5 text-sm text-[#a75043]"
              role="alert"
            >
              {actionError}
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
              <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55]">
                  <span className="inline-flex items-center gap-2"><FourDotLoader className="text-brand" />Loading products</span>
              </div>
            ) : visibleProducts.length === 0 ? (
              <div className="min-h-[220px] p-[30px] flex flex-col items-center justify-center text-center text-[#8c9990] text-sm gap-2 [&_strong]:text-sm [&_strong]:text-[#3b4c41] [&_p]:mt-0 mx-0 mb-[5px] [&_p]:max-w-[380px] [&_p]:leading-[1.55]">
                <strong>
                  {search || stockFilter !== "ALL" || category !== "ALL"
                    ? "No matching products"
                    : "Your catalogue is empty"}
                </strong>
                <p>
                  {search || stockFilter !== "ALL" || category !== "ALL"
                    ? "Try changing your search or filters."
                    : canManage(user.role)
                      ? "Add your first product to start tracking stock and sales."
                      : "Products added to your business will appear here."}
                </p>
                {canManage(user.role) && !products.length && (
                  <Link
                    href="/admin/products/new"
                    className="h-[35px] cursor-pointer px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark"
                  >
                    Add product
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="overflow-auto">
                  <table className="w-full min-w-[1120px] border-collapse text-left">
                    <thead>
                      <tr className="h-10 border-b border-[#e9eeea] bg-[#f8faf8] text-[10px] font-medium uppercase tracking-wide text-[#78857d]">
                        <th className="px-5">Product</th>
                        <th className="px-4">SKU / barcode</th>
                        <th className="px-4">Category</th>
                        <th className="px-4 text-right">Available</th>
                        <th className="px-4 text-right">Selling price</th>
                        <th className="px-4">Stock</th>
                        <th className="px-4">Product state</th>
                        {canManage(user.role) && (
                          <th className="px-4 text-right">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleProducts.map((product) => {
                        const stock = stockState(product);
                        const availableUnits = available(product);
                        return (
                          <tr
                            key={product.id}
                            className="border-b border-[#edf1ed] text-xs text-[#536159] transition-colors last:border-0 hover:bg-[#fbfdfb]"
                          >
                            <td className="px-5 py-4">
                              <div className="flex min-w-[230px] items-center gap-3">
                                {product.imageUrl ? (
                                  <Image
                                    src={product.imageUrl}
                                    alt=""
                                    width={48}
                                    height={48}
                                    unoptimized
                                    className="size-12 shrink-0 rounded-lg border border-line bg-canvas object-cover"
                                  />
                                ) : (
                                  <span
                                    aria-hidden="true"
                                    className="grid size-12 shrink-0 place-items-center rounded-lg bg-[#edf4ef] text-brand"
                                  >
                                    <AdminUiIcon name="box" size={19} />
                                  </span>
                                )}
                                <span className="grid min-w-0 gap-1">
                                  <strong className="max-w-[240px] truncate text-xs font-semibold text-[#26372d]">
                                    {product.name}
                                  </strong>
                                  <small className="text-[10px] capitalize text-muted">
                                    {product.unit}
                                  </small>
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-4">
                              <strong className="font-medium text-[#46564c]">
                                {product.sku}
                              </strong>
                              <small className="mt-1 block text-[10px] text-muted">
                                {product.barcode || "No barcode"}
                              </small>
                            </td>
                            <td className="px-4 py-4">
                              <div className="grid justify-items-start gap-1">
                                <span className="rounded-md bg-[#edf5ef] px-2.5 py-1 text-xs font-medium text-[#397853]">
                                  {product.category}
                                </span>
                                {product.subcategory && (
                                  <span className="text-[10px] text-muted">
                                    {product.subcategory}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <strong className="font-semibold tabular-nums text-[#26372d]">
                                {quantity(availableUnits)}{" "}
                                <span className="text-[10px] font-normal text-muted">
                                  {product.unit}
                                </span>
                              </strong>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <strong className="font-medium tabular-nums text-[#26372d]">
                                {currency(product.sellingPrice)}
                              </strong>
                            </td>
                            <td className="px-4 py-4">
                              <span className={statusPill(stock.toLowerCase())}>
                                {stock === "IN_STOCK"
                                  ? "In stock"
                                  : stock === "LOW_STOCK"
                                    ? "Low stock"
                                    : "Out of stock"}
                              </span>
                            </td>
                            <td className="px-4 py-4">
                              <span
                                className={statusPill(
                                  product.state.toLowerCase(),
                                )}
                              >
                                {product.state.toLowerCase()}
                              </span>
                            </td>
                            {canManage(user.role) && (
                              <td className="px-4 py-4">
                                <div className="flex items-center justify-end gap-2">
                                  <Link
                                    aria-label={`Edit ${product.name}`}
                                    title="Edit product"
                                    className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line bg-white text-muted transition-colors hover:bg-canvas hover:text-brand"
                                    href={`/admin/products/${product.id}/edit`}
                                  >
                                    <AdminUiIcon name="edit" size={16} />
                                  </Link>
                                  {product.state !== "ARCHIVED" && (
                                    <button
                                      className="h-9 cursor-pointer rounded-lg border border-line bg-white px-3 text-xs text-[#4e5e54] transition-colors hover:bg-canvas disabled:cursor-wait"
                                      disabled={productBusy === product.id}
                                      onClick={() =>
                                        void changeProductState(product)
                                      }
                                    >
                                      {productBusy === product.id ? (
                                        <span className="inline-flex items-center gap-2">
                                          <FourDotLoader /> Saving...
                                        </span>
                                      ) : product.state === "ACTIVE" ? (
                                        "Deactivate"
                                      ) : (
                                        "Activate"
                                      )}
                                    </button>
                                  )}
                                  <Link
                                    aria-label={`Manage photos for ${product.name}`}
                                    title="Manage photos"
                                    className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line bg-white text-muted transition-colors hover:bg-canvas hover:text-brand"
                                    href={`/admin/products/${product.id}/edit#product-images-title`}
                                  >
                                    <AdminUiIcon name="image" size={16} />
                                  </Link>
                                </div>
                              </td>
                            )}
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
    </div>
  );
}
