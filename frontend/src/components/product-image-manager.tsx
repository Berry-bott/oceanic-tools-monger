"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { productKeys, removeProductGalleryImage, setPrimaryProductImage, uploadProductImage, type ProductImage } from "@/services/products/product.service";

const requiredViews = ["FRONT", "BACK", "SIDE"] as const;
const viewLabels: Record<ProductImage["view"], string> = {
  FRONT: "Front view",
  BACK: "Back view",
  SIDE: "Side view",
  ADDITIONAL: "Additional view",
};

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
    <section className="grid gap-4 rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="product-images-title">
      <div>
        <h2 id="product-images-title" className="text-lg font-semibold text-ink">Product photos</h2>
        <p className="mt-1 text-sm text-muted">Photos are optional. Add Front, Back, Side or other useful views, and customers can switch between them in the public store.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {requiredViews.map((view) => {
          const image = images.find((item) => item.view === view);
          return (
            <ImageSlot key={view} label={viewLabels[view]} image={image} disabled={busy} onFile={(file) => void uploadFile(file, view)} onRemove={() => image && void removeImage(image.id)} onSetPrimary={() => image && void setPrimary.mutateAsync(image.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not set the main photo."))} />
          );
        })}
      </div>
      <div className="grid gap-3 border-t border-line pt-4">
        <div>
          <h3 className="text-base font-medium text-ink">More photos (optional)</h3>
          <p className="mt-1 text-sm text-muted">Add close-ups, accessories or other useful angles.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {images.filter((image) => image.view === "ADDITIONAL").map((image) => (
            <ImageSlot key={image.id} label={image.mediaAsset.originalFilename ? `More photos: ${image.mediaAsset.originalFilename}` : "Additional photo"} image={image} disabled={busy} onFile={(file) => void uploadFile(file, "ADDITIONAL", image.id)} onRemove={() => void removeImage(image.id)} onSetPrimary={() => void setPrimary.mutateAsync(image.id).catch((cause) => setError(cause instanceof Error ? cause.message : "Could not set the main photo."))} />
          ))}
          <ImageSlot label="Add another photo" disabled={busy} onFile={(file) => void uploadFile(file, "ADDITIONAL")} />
        </div>
      </div>
      {error && <p className="m-0 text-sm text-red-700" role="alert">{error}</p>}
      <p className="m-0 text-xs text-muted">JPEG, PNG or WebP. Maximum 5 MB per photo. Images are shared by all branches.</p>
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
        <img src={url} alt={label} className="aspect-square w-full rounded-md border border-line bg-canvas object-contain" />
      ) : (
        <div className="grid aspect-square place-items-center rounded-md bg-canvas text-sm text-muted">No photo yet</div>
      )}
      <label className="grid gap-1 text-sm text-brand">
        <span>{image ? "Replace photo" : "Choose photo"}</span>
        <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-[#edf5ef] file:px-2 file:py-2 file:text-xs file:text-brand" onChange={(event) => { onFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </label>
      {image && onSetPrimary && (image.isPrimary
        ? <span className="text-xs font-medium text-[#4b7557]">Main product photo</span>
        : <button type="button" disabled={disabled} onClick={onSetPrimary} className="justify-self-start text-xs text-brand disabled:opacity-60">Set as main photo</button>)}
      {image && onRemove && <button type="button" disabled={disabled} onClick={onRemove} className="justify-self-start text-sm text-red-700 disabled:opacity-60">Remove photo</button>}
    </div>
  );
}
