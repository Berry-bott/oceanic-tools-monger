"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminPageSkeleton, AdminTableSkeleton } from "@/components/admin-loading-skeleton";
import { AdminDialogPanel } from "@/components/admin-motion";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { FourDotLoader } from "@/components/four-dot-loader";
import {
  categoryKeys,
  createProductCategory,
  createProductSubcategory,
  deleteProductCategory,
  deleteProductSubcategory,
  getProductCategories,
  updateProductCategory,
  updateProductSubcategory,
} from "@/services/products/category.service";

type CategoryEdit = { id: string; name: string };
type SubcategoryEdit = { categoryId: string; id: string; name: string };
type DeleteTarget = {
  type: "category" | "subcategory";
  categoryId: string;
  id: string;
  name: string;
};

const fieldClass = "grid gap-2 text-sm text-[#536159]";
const inputClass = "h-11 w-full rounded-lg border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a] outline-none placeholder:text-[#aab3ac] focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]";
const secondaryButton = "inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-[#e0e7e1] bg-white px-4 text-sm text-[#4e5e54] hover:border-[#ccd9ce] hover:bg-[#f8faf8]";

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();
  const categoriesQuery = useQuery({
    queryKey: categoryKeys.all,
    queryFn: getProductCategories,
    enabled: Boolean(userQuery.data?.user),
  });
  const createCategoryMutation = useMutation({
    mutationFn: ({ name, subcategoryName }: { name: string; subcategoryName?: string }) =>
      createProductCategory(name, subcategoryName),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
  const createSubcategoryMutation = useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      createProductSubcategory(categoryId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: categoryKeys.all }),
  });
  const [error, setError] = useState("");
  const [editingCategory, setEditingCategory] = useState<CategoryEdit | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<SubcategoryEdit | null>(null);
  const [addingSubcategoryTo, setAddingSubcategoryTo] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [deleting, setDeleting] = useState(false);
  const categories = categoriesQuery.data?.data ?? [];

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("categoryName") ?? "").trim();
    const subcategoryName = String(values.get("subcategoryName") ?? "").trim();
    if (!name) return;
    setError("");
    try {
      await createCategoryMutation.mutateAsync({ name, subcategoryName });
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add category.");
    }
  }

  async function createSubcategory(event: FormEvent<HTMLFormElement>, categoryId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("subcategoryName") ?? "").trim();
    if (!name) return;
    setError("");
    try {
      await createSubcategoryMutation.mutateAsync({ categoryId, name });
      setAddingSubcategoryTo(null);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not add subcategory.");
    }
  }

  async function renameCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCategory) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    setBusyKey(`category:${editingCategory.id}`);
    try {
      await updateProductCategory(editingCategory.id, name);
      await queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      setEditingCategory(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename category.");
    } finally {
      setBusyKey("");
    }
  }

  async function renameSubcategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSubcategory) return;
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    setBusyKey(`subcategory:${editingSubcategory.id}`);
    try {
      await updateProductSubcategory(editingSubcategory.categoryId, editingSubcategory.id, name);
      await queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      setEditingSubcategory(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not rename subcategory.");
    } finally {
      setBusyKey("");
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "category") {
        await deleteProductCategory(deleteTarget.id);
      } else {
        await deleteProductSubcategory(deleteTarget.categoryId, deleteTarget.id);
      }
      await queryClient.invalidateQueries({ queryKey: categoryKeys.all });
      setDeleteTarget(null);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not delete ${deleteTarget.type}.`);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  if (userQuery.isPending) {
    return <AdminPageSkeleton variant="form" />;
  }

  if (!userQuery.data?.user) {
    return <main className="m-6 rounded-xl border border-line bg-white p-6 text-sm text-muted">Sign in to manage categories.</main>;
  }

  return (
    <main className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <nav className="mb-5 text-sm text-muted" aria-label="Breadcrumb">
        <Link className="text-brand hover:underline" href="/admin/products">Products</Link>
        <span> / Manage categories</span>
      </nav>
      <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#edf5ef] text-brand"><AdminUiIcon name="folder" size={22} /></span>
          <div>
            <p className="mb-1 mt-0 text-xs tracking-wide text-[#718b79]">PRODUCT SETUP</p>
            <h1 className="m-0 text-2xl font-semibold text-ink">Manage categories</h1>
            <p className="mb-0 mt-1 text-sm text-muted">Create a category with an optional subcategory, or manage existing ones.</p>
          </div>
        </div>
        <Link href="/admin/products/new" className={`${secondaryButton} cursor-pointer gap-2 self-start sm:self-auto`}><AdminUiIcon name="box" size={15} />Back to product creation</Link>
      </header>

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}

      <form className="mb-6 grid gap-4 rounded-xl border border-line bg-white p-5 shadow-sm sm:p-6" onSubmit={(event) => void createCategory(event)}>
        <div className="flex items-center gap-2 text-base font-medium text-ink"><span className="grid size-9 place-items-center rounded-lg bg-[#edf5ef] text-brand"><AdminUiIcon name="plus" /></span>New category</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={fieldClass}>Category name<input className={inputClass} name="categoryName" required maxLength={100} placeholder="e.g. Power tools" /></label>
          <label className={fieldClass}><span className="flex items-center gap-1">First subcategory <span className="text-muted">(optional)</span></span><input className={inputClass} name="subcategoryName" maxLength={100} placeholder="e.g. Drilling machines" /></label>
        </div>
        <div><button type="submit" disabled={createCategoryMutation.isPending} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">{createCategoryMutation.isPending ? <><FourDotLoader />Saving...</> : <><AdminUiIcon name="plus" />Add category</>}</button></div>
      </form>

      <section aria-labelledby="categories-heading">
        <div className="mb-3"><h2 id="categories-heading" className="m-0 text-lg font-semibold text-ink">Your categories</h2><p className="mb-0 mt-1 text-sm text-muted">Edit names or manage subcategories.</p></div>
        {categoriesQuery.isLoading ? <div className="overflow-hidden rounded-xl border border-line bg-white"><AdminTableSkeleton columns={3} rows={4} /></div> : null}
        {categoriesQuery.isError && <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"><p className="mb-3 mt-0">Categories could not be loaded.</p><button type="button" className={`${secondaryButton} h-9`} onClick={() => void categoriesQuery.refetch()}>Try again</button></div>}
        {!categoriesQuery.isLoading && !categoriesQuery.isError && categories.length === 0 && <div className="rounded-[14px] border border-dashed border-line bg-white"><AdminEmptyState icon="folder" title="No categories yet" description="Add your first category above to organise products." /></div>}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {categories.map((category) => (
            <article key={category.id} className="grid content-start gap-3 rounded-xl border border-line bg-white p-4 shadow-sm">
              {editingCategory?.id === category.id ? (
                <form className="flex gap-2" onSubmit={(event) => void renameCategory(event)}>
                  <input aria-label="Category name" name="name" required maxLength={100} defaultValue={editingCategory.name} className={`${inputClass} h-10`} />
                  <button type="submit" aria-label="Save category name" title="Save" disabled={busyKey === `category:${category.id}`} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg bg-brand text-white disabled:cursor-wait disabled:opacity-60">{busyKey === `category:${category.id}` ? <FourDotLoader /> : <AdminUiIcon name="check" />}</button>
                  <button type="button" aria-label="Cancel editing category" title="Cancel" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-muted" onClick={() => setEditingCategory(null)}><AdminUiIcon name="close" /></button>
                </form>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-brand"><AdminUiIcon name="folder" size={19} /></span>
                  <div className="min-w-0 flex-1"><h3 className="m-0 truncate text-sm font-medium text-ink">{category.name}</h3><span className="mt-1 block text-xs text-muted">{category.subcategories.length} subcategories</span></div>
                  <button type="button" aria-label={`Edit ${category.name}`} title="Edit category" className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-muted hover:bg-canvas hover:text-brand" onClick={() => setEditingCategory({ id: category.id, name: category.name })}><AdminUiIcon name="edit" /></button>
                  <button type="button" aria-label={`Delete ${category.name}`} title="Delete category" className="grid size-9 cursor-pointer place-items-center rounded-lg border border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteTarget({ type: "category", categoryId: category.id, id: category.id, name: category.name })}><AdminUiIcon name="trash" /></button>
                </div>
              )}

              {category.subcategories.length > 0 ? <div className="flex flex-wrap gap-2 border-t border-line pt-3">
                {category.subcategories.map((subcategory) => (
                  <div key={subcategory.id} className="inline-flex items-center gap-1 rounded-full bg-canvas py-1 pl-2.5 pr-1 text-xs text-[#536159]">
                    {editingSubcategory?.id === subcategory.id ? (
                      <form className="flex gap-2" onSubmit={(event) => void renameSubcategory(event)}>
                        <input aria-label="Subcategory name" name="name" required maxLength={100} defaultValue={editingSubcategory.name} className="h-8 w-36 rounded-md border border-line px-2 text-xs" />
                        <button type="submit" aria-label="Save subcategory name" title="Save" disabled={busyKey === `subcategory:${subcategory.id}`} className="grid size-7 cursor-pointer place-items-center rounded-full bg-white text-brand disabled:cursor-wait disabled:opacity-60">{busyKey === `subcategory:${subcategory.id}` ? <FourDotLoader className="scale-75" /> : <AdminUiIcon name="check" size={13} />}</button>
                        <button type="button" aria-label="Cancel editing subcategory" title="Cancel" className="grid size-7 cursor-pointer place-items-center rounded-full text-muted" onClick={() => setEditingSubcategory(null)}><AdminUiIcon name="close" size={13} /></button>
                      </form>
                    ) : <><span className="max-w-36 truncate">{subcategory.name}</span><button type="button" aria-label={`Edit ${subcategory.name}`} title="Edit subcategory" className="grid size-6 cursor-pointer place-items-center rounded-full text-muted hover:bg-white hover:text-brand" onClick={() => setEditingSubcategory({ categoryId: category.id, id: subcategory.id, name: subcategory.name })}><AdminUiIcon name="edit" size={13} /></button><button type="button" aria-label={`Delete ${subcategory.name}`} title="Delete subcategory" className="grid size-6 cursor-pointer place-items-center rounded-full text-muted hover:bg-red-50 hover:text-red-700" onClick={() => setDeleteTarget({ type: "subcategory", categoryId: category.id, id: subcategory.id, name: subcategory.name })}><AdminUiIcon name="trash" size={13} /></button></>}
                  </div>
                ))}
              </div> : <p className="m-0 border-t border-line pt-3 text-xs text-muted">No subcategories yet.</p>}

              {addingSubcategoryTo === category.id ? (
                <form className="flex gap-2" onSubmit={(event) => void createSubcategory(event, category.id)}>
                  <input aria-label={`New subcategory for ${category.name}`} name="subcategoryName" required maxLength={100} placeholder="Subcategory name" className={`${inputClass} h-10`} />
                  <button type="submit" aria-label="Save subcategory" title="Save" disabled={createSubcategoryMutation.isPending} className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg bg-brand text-white disabled:cursor-wait disabled:opacity-60">{createSubcategoryMutation.isPending ? <FourDotLoader /> : <AdminUiIcon name="check" />}</button>
                  <button type="button" aria-label="Cancel adding subcategory" title="Cancel" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-lg border border-line text-muted" onClick={() => setAddingSubcategoryTo(null)}><AdminUiIcon name="close" /></button>
                </form>
              ) : <button type="button" className="inline-flex cursor-pointer items-center gap-2 justify-self-start text-sm text-brand hover:text-brand-dark" onClick={() => setAddingSubcategoryTo(category.id)}><AdminUiIcon name="plus" size={15} />Add subcategory</button>}
            </article>
          ))}
        </div>
      </section>

      {deleteTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-[#14201e]/50 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeleteTarget(null); }}>
        <AdminDialogPanel role="alertdialog" aria-modal="true" aria-labelledby="delete-category-title" onEscape={() => setDeleteTarget(null)} className="w-full max-w-sm rounded-[14px] border border-line bg-white p-4 shadow-2xl">
          <span className="mb-4 grid size-11 place-items-center rounded-xl bg-red-50 text-red-700"><AdminUiIcon name="trash" size={20} /></span>
          <h2 id="delete-category-title" className="m-0 text-lg font-semibold text-ink">Delete {deleteTarget.type}?</h2>
          <p className="mb-0 mt-2 text-sm leading-6 text-muted"><strong className="font-medium text-ink">{deleteTarget.name}</strong> can only be deleted if nothing is using it.</p>
          <div className="mt-5 flex justify-end gap-2"><button type="button" disabled={deleting} className={`${secondaryButton} cursor-pointer disabled:cursor-wait`} onClick={() => setDeleteTarget(null)}>Cancel</button><button type="button" disabled={deleting} className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-red-700 bg-red-700 px-4 text-sm text-white hover:bg-red-800 disabled:cursor-wait disabled:opacity-60" onClick={() => void confirmDelete()}>{deleting ? <><FourDotLoader />Deleting...</> : <><AdminUiIcon name="trash" size={15} />Delete</>}</button></div>
        </AdminDialogPanel>
      </div>}
    </main>
  );
}
