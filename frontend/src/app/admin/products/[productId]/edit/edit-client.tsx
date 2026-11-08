"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { ProductImageManager } from "@/components/product-image-manager";
import { ProductSpecificationsEditor, type ProductSpecificationInput } from "@/components/product-specifications-editor";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { categoryKeys, getProductCategories } from "@/services/products/category.service";
import { getProduct, productKeys, updateProduct } from "@/services/products/product.service";

const canManage = (user?: { role: string; staffAccessRole?: string | null }) => user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");
const fieldClass = "grid gap-1.5 text-sm text-[#536159]";
const inputClass = "h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]";
const sectionClass = "grid gap-4 rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5";

export default function EditProductPage({ productId }: { productId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const userQuery = useCurrentUser();
  const productQuery = useQuery({ queryKey: [...productKeys.all, productId], queryFn: () => getProduct(productId), enabled: Boolean(productId) });
  const categoriesQuery = useQuery({ queryKey: categoryKeys.all, queryFn: getProductCategories });
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [specifications, setSpecifications] = useState<ProductSpecificationInput[]>([]);
  const initializedProductId = useRef<string | null>(null);
  const mutation = useMutation({
    mutationFn: (input: Record<string, unknown>) => updateProduct(productId, input),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: productKeys.all }), invalidateAdminSummaries(client)]);
      router.push("/admin/products");
    },
  });
  const product = productQuery.data?.data;
  const selectedCategoryId = categoryId || product?.categoryId || "";
  const selectedCategory = categoriesQuery.data?.data.find((category) => category.id === selectedCategoryId);

  useEffect(() => {
    if (!product || initializedProductId.current === product.id) return;
    initializedProductId.current = product.id;
    setCategoryId(product.categoryId ?? "");
    setSubcategoryId(product.subcategoryId ?? "");
    setSpecifications((product.specifications ?? []).map(({ name, value }) => ({ name, value })));
  }, [product]);

  if (!userQuery.data || productQuery.isLoading) return <AdminPageSkeleton variant="form" />;
  if (!canManage(userQuery.data.user)) return <main className="mx-auto max-w-5xl px-4 py-8 text-sm text-muted">You do not have access to edit products.</main>;
  if (productQuery.isError || !product) return <main className="mx-auto max-w-5xl px-4 py-8 text-sm text-red-700">Product could not be loaded. <Link href="/admin/products" className="underline">Return to products</Link></main>;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const category = categoriesQuery.data?.data.find((item) => item.id === selectedCategoryId);
    mutation.mutate({
      name: form.get("name"), sku: form.get("sku"), barcode: form.get("barcode"),
      description: form.get("description"), brand: form.get("brand"), model: form.get("model"),
      category: category?.name, categoryId: selectedCategoryId, subcategoryId: subcategoryId || null,
      unit: form.get("unit"), costPrice: Number(form.get("costPrice")),
      sellingPrice: Number(form.get("sellingPrice")), reorderLevel: Number(form.get("reorderLevel")),
      isPublished: form.get("isPublished") === "on",
      specifications: specifications.filter((item) => item.name.trim() && item.value.trim()),
    });
  }

  const details = [
    ["name", "Product name", product.name, true],
    ["sku", "SKU", product.sku, true],
    ["barcode", "Barcode", product.barcode ?? "", false],
    ["brand", "Brand", product.brand ?? "", true],
    ["model", "Model", product.model ?? "", false],
    ["unit", "Unit", product.unit, true],
  ] as const;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5 sm:px-6 sm:py-8">
      <header className="mb-5">
        <p className="mb-1 text-xs font-medium tracking-wide text-[#718b79]">PRODUCT MANAGEMENT</p>
        <h1 className="m-0 text-2xl font-semibold tracking-tight text-ink">Edit product</h1>
        <p className="mb-0 mt-1 text-sm text-muted">Update product information, price and photos. Manage stock on the Stock page.</p>
      </header>

      <form className="grid gap-4" onSubmit={submit}>
        <section className={sectionClass} aria-labelledby="edit-product-details">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-brand"><AdminUiIcon name="box" size={18} /></span>
            <div><h2 id="edit-product-details" className="m-0 text-base font-semibold text-ink">Product details</h2><p className="mb-0 mt-0.5 text-sm text-muted">Name, brand and product code.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {details.map(([name, label, value, required]) => (
              <label key={name} className={fieldClass}>{label}<input name={name} required={required} defaultValue={value} className={inputClass} /></label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={fieldClass}>Category
              <select required value={selectedCategoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(""); }} className={inputClass}>
                <option value="">Choose category</option>
                {categoriesQuery.data?.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              {categoriesQuery.isError && <span className="text-xs text-red-700">Could not load categories. Refresh and try again.</span>}
            </label>
            <label className={fieldClass}>Subcategory <span className="text-xs text-muted">(optional)</span>
              <select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)} disabled={!selectedCategoryId || categoriesQuery.isLoading} className={inputClass}>
                <option value="">{selectedCategory?.subcategories.length ? "No subcategory" : "No subcategory"}</option>
                {selectedCategory?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
          <label className={fieldClass}>Description <span className="text-xs text-muted">(optional)</span>
            <textarea name="description" rows={3} defaultValue={product.description ?? ""} className="w-full rounded-lg border border-line bg-white p-3 text-sm text-ink outline-none focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]" />
          </label>
        </section>

        <section className={sectionClass} aria-labelledby="edit-product-pricing">
          <div className="flex items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-brand"><AdminUiIcon name="tag" size={18} /></span>
            <div><h2 id="edit-product-pricing" className="m-0 text-base font-semibold text-ink">Price and stock warning</h2><p className="mb-0 mt-0.5 text-sm text-muted">Set the current selling and cost prices.</p></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[["sellingPrice", "Selling price (NGN)", product.sellingPrice], ["costPrice", "Cost price (NGN)", product.costPrice ?? 0], ["reorderLevel", "Low stock warning at", product.reorderLevel]].map(([name, label, value]) => (
              <label key={String(name)} className={fieldClass}>{String(label)}<input name={String(name)} type="number" min="0" step="0.01" required defaultValue={String(value)} className={inputClass} /></label>
            ))}
          </div>
        </section>

        <section className="rounded-xl border border-line bg-white p-4 shadow-sm sm:p-5">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-[#536159]">
            <input name="isPublished" type="checkbox" defaultChecked={product.isPublished ?? false} className="mt-0.5 size-4 cursor-pointer accent-brand" />
            <span><strong className="block font-medium text-ink">Show in public store</strong><span className="mt-0.5 block text-sm text-muted">Product photos are optional. Add any of the three views when available.</span></span>
          </label>
        </section>

        <section className={sectionClass} aria-labelledby="edit-product-specifications">
          <div><h2 id="edit-product-specifications" className="m-0 text-base font-semibold text-ink">Product specifications</h2><p className="mb-0 mt-0.5 text-sm text-muted">Add useful product details for staff and customers.</p></div>
          <ProductSpecificationsEditor specifications={specifications} onChange={setSpecifications} />
        </section>

        {mutation.error && <p role="alert" className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{mutation.error.message}</p>}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-canvas/95 py-3 backdrop-blur">
          <Link href="/admin/products" className="inline-flex h-10 cursor-pointer items-center rounded-lg border border-line bg-white px-4 text-sm text-ink hover:bg-canvas">Cancel</Link>
          <button type="submit" disabled={mutation.isPending || categoriesQuery.isError} className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-brand px-4 text-sm font-medium text-white hover:bg-[#194b3a] disabled:cursor-wait disabled:opacity-60">
            {mutation.isPending ? "Saving changes..." : "Save changes"}
          </button>
        </div>
      </form>

      <div className="mt-4"><ProductImageManager productId={productId} images={product.productImages ?? []} /></div>
    </main>
  );
}
