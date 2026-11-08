"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  useCreateProduct,
  useUploadProductImage,
} from "@/hooks/mutations/use-product-mutations";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranches } from "@/hooks/queries/use-branches";
import { ProductSpecificationsEditor, type ProductSpecificationInput } from "@/components/product-specifications-editor";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { FourDotLoader } from "@/components/four-dot-loader";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { checkProductDuplicates, type ProductDuplicate } from "@/services/products/product.service";
import { categoryKeys, getProductCategories } from "@/services/products/category.service";

type Role = "OWNER" | "STAFF";
type User = { id: string; name: string; email: string; role: Role; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null; branchId?: string | null };
type Branch = { id: string; name: string; isDefault: boolean };
const canManage = (user: User | null) => user?.role === "OWNER" || (user?.role === "STAFF" && user.staffAccessRole === "SENIOR_STAFF");

const fieldClass = "grid gap-2 text-sm text-[#536159]";
const inputClass = "h-11 w-full rounded-lg border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a] outline-none placeholder:text-[#aab3ac] focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]";
const textareaClass = "w-full rounded-lg border border-[#dfe6e0] bg-white p-3 text-sm text-[#34413a] outline-none placeholder:text-[#aab3ac] focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]";
const secondaryButton = "inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-[#e0e7e1] bg-white px-4 text-sm text-[#4e5e54] hover:border-[#ccd9ce] hover:bg-[#f8faf8]";

export default function NewProductPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const userQuery = useCurrentUser();
  const user = (userQuery.data?.user as User | undefined) ?? null;
  const branchQuery = useBranches<Branch>(Boolean(user));
  const categoriesQuery = useQuery({ queryKey: categoryKeys.all, queryFn: getProductCategories, enabled: Boolean(user) });
  const loading = userQuery.isPending;
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<Record<"FRONT" | "BACK" | "SIDE", File | null>>({ FRONT: null, BACK: null, SIDE: null });
  const [specifications, setSpecifications] = useState<ProductSpecificationInput[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedCategoryIdOverride, setSelectedCategoryIdOverride] = useState<string | null>(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [publishOnSave, setPublishOnSave] = useState(true);
  const [savedProductVisibility, setSavedProductVisibility] = useState<boolean | null>(null);
  const [primaryImageKey, setPrimaryImageKey] = useState("FRONT");
  const [savedProductId, setSavedProductId] = useState("");
  const [possibleDuplicates, setPossibleDuplicates] = useState<ProductDuplicate[]>([]);
  const [confirmedDuplicateKey, setConfirmedDuplicateKey] = useState("");
  const [pendingDuplicateKey, setPendingDuplicateKey] = useState("");
  const createProductMutation = useCreateProduct();
  const uploadImageMutation = useUploadProductImage();
  const returnToReceiving = searchParams.get("returnTo") === "receive-stock";
  const selectedCategoryId = selectedCategoryIdOverride ?? searchParams.get("categoryId") ?? "";
  const selectedCategory = categoriesQuery.data?.data.find((category) => category.id === selectedCategoryId);
  const assignedBranch = branchQuery.data?.data.find((branch) => branch.id === user?.branchId);

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || !canManage(user)) return;
    setError("");
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      let productId = savedProductId;
      if (!productId) {
        if (user.role === "OWNER" && !selectedBranchId) {
          throw new Error("Choose a branch for this product.");
        }
        if (user.role === "STAFF" && !user.branchId) {
          throw new Error("Ask the owner to assign your account to a branch before creating products.");
        }
        const duplicateKey = [form.get("sku"), form.get("barcode"), form.get("name")].map((value) => String(value ?? "").trim().toLocaleLowerCase()).join("|");
        const duplicateCheck = await checkProductDuplicates({
          sku: String(form.get("sku") ?? ""),
          barcode: String(form.get("barcode") ?? ""),
          name: String(form.get("name") ?? ""),
        });
        const codeMatches = duplicateCheck.data.filter((item) =>
          item.sku.toLocaleLowerCase() === String(form.get("sku") ?? "").trim().toLocaleLowerCase()
          || Boolean(form.get("barcode") && item.barcode?.toLocaleLowerCase() === String(form.get("barcode")).trim().toLocaleLowerCase()),
        );
        if (codeMatches.length) {
          throw new Error(`SKU or barcode already belongs to ${codeMatches.map((item) => `${item.name} (${item.sku})`).join(", ")}.`);
        }
        if (duplicateCheck.data.length && confirmedDuplicateKey !== duplicateKey) {
          setPossibleDuplicates(duplicateCheck.data);
          setPendingDuplicateKey(duplicateKey);
          setConfirmedDuplicateKey("");
          setSaving(false);
          return;
        }
        setPossibleDuplicates([]);
        setPendingDuplicateKey("");
        setConfirmedDuplicateKey("");
        const result = await createProductMutation.mutateAsync({
          name: form.get("name"),
          sku: form.get("sku"),
          barcode: form.get("barcode"),
          description: form.get("description"),
          brand: form.get("brand"),
          model: form.get("model"),
          specifications: specifications.filter((item) => item.name.trim() && item.value.trim()),
          branchAssignments: user.role === "OWNER" ? [{ branchId: selectedBranchId, openingStock: Number(quantity) }] : undefined,
          quantity: Number(quantity),
          publishOnSave,
          category: form.get("category"),
          categoryId: selectedCategoryId,
          subcategoryId: selectedSubcategoryId || undefined,
          sellingPrice: form.get("sellingPrice"),
          costPrice: form.get("costPrice"),
          unit: form.get("unit"),
          reorderLevel: form.get("reorderLevel"),
        });
        productId = result.data.id;
        setSavedProductId(productId);
        setSavedProductVisibility(publishOnSave);
      }
      if (productId) {
        try {
          for (const view of ["FRONT", "BACK", "SIDE"] as const) {
            const file = images[view];
            if (file) {
              await uploadImageMutation.mutateAsync({ id: productId, file, view, isPrimary: primaryImageKey === view });
              setImages((current) => ({ ...current, [view]: null }));
            }
          }
        } catch (uploadError) {
          setError(
            `Product saved, but its image was not uploaded. ${uploadError instanceof Error ? uploadError.message : "Choose the image again and retry."}`,
          );
          setSaving(false);
          return;
        }
      }
      window.sessionStorage.setItem(
        "oceanic-product-created",
        (savedProductVisibility ?? publishOnSave) ? "published" : "draft",
      );
      router.push(returnToReceiving ? "/admin/purchasing" : "/admin/products");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Product could not be created. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading)
    return <AdminPageSkeleton variant="form" />;
  if (!user || !canManage(user))
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <section
          className="bg-white border border-line rounded-xl p-6 text-[#a5554a]"
          role="alert"
        >
          <p>{error || "You do not have permission to add products."}</p>
          <Link className="text-[#28664e] font-normal" href="/admin/products">
            Return to products
          </Link>
        </section>
      </main>
    );

  return (
    <main className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <nav
        className="mb-5 text-sm text-[#829087]"
        aria-label="Breadcrumb"
      >
        <Link
          className="text-[#397853] [&:hover]:[text-decoration:underline]"
          href={returnToReceiving ? "/admin/purchasing" : "/admin/products"}
        >
          {returnToReceiving ? "Receive stock" : "Products"}
        </Link>
        <span> / Add product</span>
      </nav>
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mt-0 mx-0 mb-2 text-sm font-normal tracking-wide text-[#718b79]">
            PRODUCT MANAGEMENT
          </p>
          <h1 className="m-0 text-3xl font-bold tracking-tight text-[#1a2a22]">
            Add a product
          </h1>
          <p className="mt-2 mx-0 mb-0 text-base text-[#75827c]">
            Add the product details and its quantity for the branch.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {returnToReceiving && <Link href="/admin/purchasing" className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm text-ink hover:bg-canvas">
            Return to receiving
          </Link>}
          <Link
            href="/admin/categories"
            className="inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 text-sm text-ink hover:bg-canvas"
          >
            <AdminUiIcon name="folder" size={17} />
            Manage categories
          </Link>
        </div>
      </header>
      <div className="mx-auto w-full max-w-4xl">
        <form
          className="grid gap-5"
          onSubmit={(event) => void createProduct(event)}
        >
          <section className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:p-6" aria-labelledby="product-details-heading">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="box" size={19} /></span>
              <div><h2 id="product-details-heading" className="m-0 text-lg font-semibold text-ink">Product details</h2>
              <p className="mb-0 mt-1 text-sm text-muted">Add the information your staff and customers need.</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <span className="text-sm text-[#536159]">Category</span>
                <select
                  className={inputClass}
                  required
                  value={selectedCategoryId}
                  onChange={(event) => { setSelectedCategoryIdOverride(event.target.value); setSelectedSubcategoryId(""); }}
                  disabled={categoriesQuery.isPending || categoriesQuery.isError || !categoriesQuery.data?.data.length}
                  aria-label="Product category"
                >
                  <option value="">{categoriesQuery.isPending ? "Loading categories..." : "Choose a category"}</option>
                  {categoriesQuery.data?.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                </select>
                <input type="hidden" name="category" value={selectedCategory?.name ?? ""} />
                {categoriesQuery.isError && <p className="m-0 text-sm text-red-700" role="alert">Could not load categories. Refresh the page and try again.</p>}
                {!categoriesQuery.isPending && !categoriesQuery.isError && !categoriesQuery.data?.data.length && (
                  <p className="m-0 text-sm text-[#75827c]">Create a category using Manage categories before adding products.</p>
                )}
              </div>
              <label className={fieldClass}>Subcategory
                <select className={inputClass} value={selectedSubcategoryId} onChange={(event) => setSelectedSubcategoryId(event.target.value)} disabled={!selectedCategory?.subcategories.length}>
                  <option value="">{selectedCategory?.subcategories.length ? "No subcategory (optional)" : "No subcategory"}</option>
                  {selectedCategory?.subcategories.map((subcategory) => <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>)}
                </select>
              </label>
            </div>
            <label className={fieldClass}>Product name<input className={inputClass} name="name" required disabled={!selectedCategoryId} maxLength={180} autoFocus placeholder={selectedCategoryId ? "e.g. Golden Penny Pasta" : "Choose a category first"} /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={fieldClass}>SKU<input className={inputClass} name="sku" required maxLength={80} placeholder="e.g. GPP-500G-001" /></label>
              <label className={fieldClass}><span className="flex items-center gap-1">Barcode <span className="text-muted">(optional)</span></span><input className={inputClass} name="barcode" maxLength={80} placeholder="Scan or enter barcode" /></label>
              <label className={fieldClass}>Brand<input className={inputClass} name="brand" required maxLength={120} placeholder="e.g. CAT" /></label>
              <label className={fieldClass}><span className="flex items-center gap-1">Model <span className="text-muted">(optional)</span></span><input className={inputClass} name="model" maxLength={120} placeholder="e.g. 10KVA" /></label>
            </div>
            <label className={fieldClass}><span className="flex items-center gap-1">Description <span className="text-muted">(optional)</span></span><textarea name="description" rows={4} maxLength={5000} className={`${textareaClass} resize-y`} placeholder="Add details that help staff and customers understand this product." /></label>
          </section>
          <ProductSpecificationsEditor specifications={specifications} onChange={setSpecifications} />
          <section className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:p-6" aria-labelledby="product-images-heading">
            <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="image" size={19} /></span><div><h2 id="product-images-heading" className="m-0 text-base font-semibold text-ink">Product photos</h2><p className="mb-0 mt-1 text-sm text-muted">Photos are optional. Add any views you have now or upload them later.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-3">
              {(["FRONT", "BACK", "SIDE"] as const).map((view) => {
                const label = `${view[0]}${view.slice(1).toLowerCase()} view`;
                return (
                  <div key={view} className="grid content-start gap-3 rounded-lg border border-line p-3">
                    <h3 className="m-0 text-sm font-medium text-ink">{label}<span className="ml-1 text-xs font-normal text-muted">Optional</span></h3>
                    {images[view] ? <LocalImagePreview file={images[view]} alt={`${label} preview`} className="mx-auto aspect-square w-full max-w-40 rounded-lg border border-line bg-canvas object-contain" /> : <div className="mx-auto grid aspect-square w-full max-w-40 place-items-center rounded-lg bg-canvas text-xs text-muted">No photo added</div>}
                    <label className="relative inline-flex h-9 w-fit cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-lg border border-line bg-white px-3 text-xs font-medium text-brand hover:bg-canvas">
                      <AdminUiIcon name="image" size={15} />
                      {images[view] ? "Replace photo" : "Choose photo"}
                      <input type="file" accept="image/jpeg,image/png,image/webp" aria-label={`${images[view] ? "Replace" : "Choose"} ${label}`} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024)) { setError("Choose a JPEG, PNG or WebP image up to 5 MB."); } else { setError(""); setImages((current) => ({ ...current, [view]: file })); } event.currentTarget.value = ""; }} />
                    </label>
              {images[view] && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs"><button type="button" className="cursor-pointer text-brand" onClick={() => setPrimaryImageKey(view)}>{primaryImageKey === view ? "Main photo" : "Set as main photo"}</button><button type="button" aria-label={`Remove ${label.toLowerCase()}`} title="Remove photo" className="grid size-8 cursor-pointer place-items-center rounded-lg border border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => { setImages((current) => ({ ...current, [view]: null })); if (primaryImageKey === view) setPrimaryImageKey("FRONT"); }}><AdminUiIcon name="trash" /></button></div>}
                  </div>
                );
              })}
            </div>
            <p className="m-0 text-xs text-muted">JPEG, PNG or WebP. Maximum 5 MB per photo. Photos are shared by every branch.</p>
          </section>
          <section className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:p-6" aria-labelledby="pricing-heading">
            <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="tag" size={19} /></span><div><h2 id="pricing-heading" className="m-0 text-lg font-semibold text-ink">Price and stock warning</h2><p className="mb-0 mt-1 text-sm text-muted">Set your selling price and the level that should trigger a low stock warning.</p></div></div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className={fieldClass}>
              Selling price (NGN)
              <input
                className={inputClass}
                name="sellingPrice"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="0.00"
              />
            </label>
            <label className={fieldClass}>
              Cost price (NGN)
              <input
                className={inputClass}
                name="costPrice"
                type="number"
                min="0"
                step="0.01"
                required
                placeholder="Enter the cost for one unit"
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <label className={fieldClass}>
              Unit
              <input
                className={inputClass}
                name="unit"
                defaultValue="piece"
                required
                maxLength={40}
                placeholder="e.g. piece, bag, carton"
              />
            </label>
            <label className={fieldClass}>
              Quantity
              <input
                className={inputClass}
                name="quantity"
                type="number"
                min="0"
                step="0.001"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <label className={fieldClass}>
              Low stock warning at
              <input
                className={inputClass}
                name="reorderLevel"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                required
              />
            </label>
          </div>
          </section>
          <section className="grid gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:p-6" aria-labelledby="branch-setup-heading">
            <div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="folder" size={19} /></span><div><h2 id="branch-setup-heading" className="m-0 text-lg font-semibold text-ink">Branch</h2><p className="mb-0 mt-1 text-sm text-muted">Choose the branch where this product will be kept.</p></div></div>
            {user.role === "OWNER" ? (
              <div className="grid gap-4">
                <label className={`${fieldClass} max-w-xl`}>Branch
                  <select className={inputClass} value={selectedBranchId} onChange={(event) => setSelectedBranchId(event.target.value)} required disabled={branchQuery.isLoading || branchQuery.isError || !branchQuery.data?.data.length}>
                    <option value="">{branchQuery.isLoading ? "Loading branches..." : "Choose a branch"}</option>
                    {(branchQuery.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}{branch.isDefault ? " (Main branch)" : ""}</option>)}
                  </select>
                </label>
              </div>
            ) : (
              <div className="max-w-xl rounded-lg border border-[#dcebe0] bg-[#f1f8f3] p-3 text-sm text-[#4b7557]">
                  {user.branchId
                    ? `This product will be assigned to ${assignedBranch?.name ?? "your assigned branch"}.`
                    : "Your account has no branch yet. Ask the owner to assign one before you add a product."}
              </div>
            )}
            {branchQuery.isError && (
              <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-red-700">
                <span>Could not load branches. Try again before saving.</span>
                <button type="button" onClick={() => void branchQuery.refetch()} className="rounded-md border border-line bg-white px-3 py-1.5 text-sm text-ink">Try again</button>
              </div>
            )}
            {user.role === "OWNER" && !branchQuery.isLoading && !(branchQuery.data?.data.length) && <p className="m-0 text-sm text-[#a75043]">Create a branch before adding a product.</p>}
          </section>
          <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6" aria-labelledby="website-visibility-heading">
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="image" size={19} /></span>
              <div>
                <h2 id="website-visibility-heading" className="m-0 text-base font-semibold text-ink">Website visibility</h2>
                <p className="mb-0 mt-1 text-sm text-muted">
                  {savedProductVisibility === null
                    ? publishOnSave ? "Published after saving. Switch off to keep this product as a draft." : "Saved as a draft and hidden from customers. Switch on to publish after saving."
                    : savedProductVisibility ? "This product is set to publish after saving." : "This product is set to save as a draft."}
                  {" "}Photos are optional and can be added later.
                </p>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={savedProductVisibility ?? publishOnSave}
              aria-label="Publish product after saving"
              disabled={Boolean(savedProductId) || saving}
              onClick={() => setPublishOnSave((current) => !current)}
              className={`inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 ${publishOnSave ? "bg-brand" : "bg-[#cbd5ce]"}`}
            >
              <span className={`size-5 rounded-full bg-white shadow-sm transition-transform ${publishOnSave ? "translate-x-5" : "translate-x-0"}`} />
            </button>
          </section>
          {possibleDuplicates.length > 0 && !savedProductId && (
            <section className="grid gap-3 rounded-lg border border-[#ead9ad] bg-[#fffaf0] p-4 text-sm text-[#725b2a]" aria-labelledby="similar-products-title">
              <div>
                <h2 id="similar-products-title" className="m-0 text-base font-semibold">A product with this name already exists</h2>
                <p className="mb-0 mt-1">Check these products first to avoid adding the same item twice.</p>
                <ul className="mb-0 mt-2 list-inside list-disc">{possibleDuplicates.map((product) => <li key={product.id}>{product.name} - {product.sku}</li>)}</ul>
              </div>
              <label className="flex cursor-pointer items-start gap-2 text-sm">
                <input type="checkbox" checked={confirmedDuplicateKey === pendingDuplicateKey && Boolean(pendingDuplicateKey)} onChange={(event) => setConfirmedDuplicateKey(event.target.checked ? pendingDuplicateKey : "")} className="mt-1 size-4 accent-brand" />
                <span>I checked the list. This is a different product, so continue.</span>
              </label>
            </section>
          )}
          {error && (
            <p className="m-0 text-[#b44f44] text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2 max-[620px]:flex-col-reverse">
            <Link className={secondaryButton} href="/admin/products">
              Cancel
            </Link>
            <button
              className="h-10 cursor-pointer rounded-lg border border-brand bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-65"
              type="submit"
              disabled={saving || branchQuery.isLoading || Boolean(branchQuery.isError) || (user.role === "OWNER" && !selectedBranchId) || (user.role === "STAFF" && !user.branchId) || (possibleDuplicates.length > 0 && confirmedDuplicateKey !== pendingDuplicateKey)}
            >
              {saving ? <span className="inline-flex items-center gap-2"><FourDotLoader />{savedProductId ? "Uploading photos..." : "Saving product..."}</span> : savedProductId ? "Retry photo upload" : possibleDuplicates.length > 0 ? confirmedDuplicateKey === pendingDuplicateKey ? "Create this product" : "Review the product name" : "Save product"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

function LocalImagePreview({ file, alt, className }: { file: File; alt: string; className: string }) {
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const imageUrl = URL.createObjectURL(file);
    if (imageRef.current) imageRef.current.src = imageUrl;
    return () => URL.revokeObjectURL(imageUrl);
  }, [file]);

  // This is a short-lived local blob preview, so Next's image optimizer cannot process it.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={imageRef} alt={alt} className={className} />;
}
