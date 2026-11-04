"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { getProduct, productKeys, updateProduct } from "@/services/products/product.service";
import { categoryKeys, getProductCategories } from "@/services/products/category.service";
import { ProductImageManager } from "@/components/product-image-manager";
import { ProductSpecificationsEditor, type ProductSpecificationInput } from "@/components/product-specifications-editor";

const canManage = (role?: string) => role === "OWNER" || role === "STAFF";
const fieldClass = "grid gap-1 text-sm text-[#536159]";
const inputClass = "h-10 rounded-md border border-line bg-white px-3 text-ink";

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

  if (!userQuery.data || productQuery.isLoading) return <main className="p-8 text-sm text-muted">Loading product...</main>;
  if (!canManage(userQuery.data.user.role)) return <main className="p-8 text-sm text-muted">You do not have access to edit products.</main>;
  if (productQuery.isError || !product) return <main className="p-8 text-sm text-red-700">Product could not be loaded. <Link href="/admin/products" className="underline">Return to products</Link></main>;

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

  return (
    <main className="mx-auto max-w-3xl p-4 py-8 sm:p-8">
      <Link href="/admin/products" className="text-sm text-brand">Products / Edit product</Link>
      <h1 className="mt-3 text-2xl font-bold">Edit product</h1>
      <p className="mb-6 mt-2 text-sm text-muted">Update the product details. Stock changes are recorded from Stock.</p>
      <form className="grid gap-4 rounded-xl border border-line bg-white p-5" onSubmit={submit}>
        {[
          ["name", "Product name", product.name], ["sku", "SKU", product.sku],
          ["barcode", "Barcode", product.barcode ?? ""], ["brand", "Brand", product.brand ?? ""],
          ["model", "Model", product.model ?? ""], ["unit", "Unit", product.unit],
        ].map(([name, label, value]) => <label key={String(name)} className={fieldClass}>{String(label)}<input name={String(name)} required={!(["barcode", "brand", "model"] as string[]).includes(String(name))} defaultValue={String(value)} className={inputClass} /></label>)}
        <label className={fieldClass}>Category
          <select required value={selectedCategoryId} onChange={(event) => { setCategoryId(event.target.value); setSubcategoryId(""); }} className={inputClass}>
            <option value="">Choose category</option>
            {categoriesQuery.data?.data.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {categoriesQuery.isError && <span className="text-xs text-red-700">Could not load categories. Refresh and try again.</span>}
        </label>
          <label className={fieldClass}>Subcategory <span className="text-muted">(optional)</span>
          <select value={subcategoryId} onChange={(event) => setSubcategoryId(event.target.value)} disabled={!selectedCategoryId || categoriesQuery.isLoading} className={inputClass}>
            <option value="">{selectedCategory?.subcategories.length ? "No subcategory (optional)" : "No subcategory"}</option>
            {selectedCategory?.subcategories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className={fieldClass}>Description<textarea name="description" rows={3} defaultValue={product.description ?? ""} className="rounded-md border border-line p-3 text-ink" /></label>
        <label className="flex items-start gap-3 rounded-lg border border-line p-3 text-sm text-[#536159]"><input name="isPublished" type="checkbox" defaultChecked={product.isPublished ?? false} className="mt-1 accent-brand" /><span><strong className="block font-medium text-ink">Show in public store</strong><span className="mt-1 block text-muted">Product photos are optional. Add any views that help customers see the item.</span></span></label>
        <ProductSpecificationsEditor specifications={specifications} onChange={setSpecifications} />
        <div className="grid gap-4 sm:grid-cols-3">{[["sellingPrice", "Selling price", product.sellingPrice], ["costPrice", "Unit cost", product.costPrice ?? 0], ["reorderLevel", "Low stock warning at", product.reorderLevel]].map(([name, label, value]) => <label key={String(name)} className={fieldClass}>{String(label)}<input name={String(name)} type="number" min="0" step="0.01" required defaultValue={String(value)} className={inputClass} /></label>)}</div>
        {mutation.error && <p role="alert" className="text-sm text-red-700">{mutation.error.message}</p>}
        <div className="flex justify-end gap-2"><Link href="/admin/products" className="rounded-md border border-line px-4 py-2 text-sm">Cancel</Link><button disabled={mutation.isPending || categoriesQuery.isError} className="rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-60">{mutation.isPending ? "Saving..." : "Save changes"}</button></div>
      </form>
      <div className="mt-5"><ProductImageManager productId={productId} images={product.productImages ?? []} /></div>
    </main>
  );
}
