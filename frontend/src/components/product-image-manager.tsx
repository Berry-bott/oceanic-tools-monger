"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { productKeys, removeProductGalleryImage, setPrimaryProductImage, uploadProductImage, type ProductImage } from "@/services/products/product.service";

const productViews = [
  { key: "FRONT", label: "Front view" },
  { key: "BACK", label: "Back view" },
  { key: "SIDE", label: "Side view" },
] as const;

export function ProductImageManager({ productId, images = [] }: { productId: string; images: ProductImage[] }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const upload = useMutation({
    mutationFn: ({ file, view, imageId }: { file: File; view: ProductImage["view"]; imageId?: string }) => uploadProductImage(productId, file, view, imageId),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [...productKeys.all, productId] }),
      queryClient.invalidateQueries({ queryKey: productKeys.all }),
    ]),
  });
  const remove = useMutation({
    mutationFn: (imageId: string) => removeProductGalleryImage(productId, imageId),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [...productKeys.all, productId] }),
      queryClient.invalidateQueries({ queryKey: productKeys.all }),
    ]),
  });
  const setPrimary = useMutation({
    mutationFn: (imageId: string) => setPrimaryProductImage(productId, imageId),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: [...productKeys.all, productId] }),
      queryClient.invalidateQueries({ queryKey: productKeys.all }),
    ]),
  });

  async function uploadFile(file: File | undefined, view: ProductImage["view"], imageId?: string) {
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPEG, PNG or WebP image up to 5 MB.");
      return;
    }
    setError("");
    try {
      await upload.mutateAsync({ file, view, imageId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image upload failed. Try again.");
    }
  }

  async function removeImage(imageId: string) {
    setError("");
    try {
      await remove.mutateAsync(imageId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Image removal failed. Try again.");
    }
  }

  const busy = upload.isPending || remove.isPending || setPrimary.isPending;
  return (
    <section className="grid gap-4 rounded-xl border border-line bg-white p-4 sm:p-5" aria-labelledby="product-images-title">
      <div>
        <h2 id="product-images-title" className="text-base font-semibold text-ink">Product photos</h2>
        <p className="mt-1 text-sm text-muted">Add a front, back or side photo. Customers can switch between uploaded views.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {productViews.map(({ key: view, label }) => {
          const image = images.find((item) => item.view === view);
          return (
            <ImageSlot
              key={view}
              label={label}
              image={image}
              disabled={busy}
              onFile={(file) => void uploadFile(file, view)}
              onRemove={image ? () => void removeImage(image.id) : undefined}
              onSetPrimary={image ? () => void setPrimary.mutateAsync(image.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not set the main photo.")) : undefined}
            />
          );
        })}
      </div>
      {error && <p className="m-0 text-sm text-red-700" role="alert">{error}</p>}
      <p className="m-0 text-xs text-muted">JPEG, PNG or WebP. Up to 5 MB per photo. Photos are shared by all branches.</p>
    </section>
  );
}

function ImageSlot({ label, image, disabled, onFile, onRemove, onSetPrimary }: { label: string; image?: ProductImage; disabled: boolean; onFile: (file?: File) => void; onRemove?: () => void; onSetPrimary?: () => void }) {
  const url = image?.mediaAsset.secureUrl;
  return (
    <div className="grid content-start gap-2 rounded-lg border border-line p-3">
      <strong className="text-sm font-medium text-ink">{label}</strong>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="mx-auto aspect-square w-full max-w-40 rounded-md border border-line bg-canvas object-contain" />
      ) : (
        <div className="mx-auto grid aspect-square w-full max-w-40 place-items-center rounded-md bg-canvas text-xs text-muted">No photo yet</div>
      )}
      <label className="relative inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 overflow-hidden rounded-md border border-line bg-white px-2.5 text-xs font-medium text-brand hover:bg-canvas has-[:disabled]:cursor-wait has-[:disabled]:opacity-60">
        <AdminUiIcon name="image" size={14} />
        {image ? "Replace photo" : "Choose photo"}
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} aria-label={`${image ? "Replace" : "Choose"} ${label}`} className="absolute inset-0 cursor-pointer opacity-0" onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </label>
      {image && onSetPrimary && (image.isPrimary
        ? <span className="text-xs font-medium text-[#4b7557]">Main product photo</span>
        : <button type="button" disabled={disabled} onClick={onSetPrimary} className="w-fit cursor-pointer text-xs text-brand disabled:opacity-60">Set as main photo</button>)}
      {image && onRemove && <button type="button" aria-label={`Remove ${label.toLowerCase()}`} title="Remove photo" disabled={disabled} onClick={onRemove} className="grid size-7 cursor-pointer place-items-center rounded-md border border-line text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"><AdminUiIcon name="trash" size={14} /></button>}
    </div>
  );
}
