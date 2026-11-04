"use client";

import { useState } from "react";

type Image = { id: string; view: "FRONT" | "BACK" | "SIDE" | "ADDITIONAL"; imageUrl: string | null; originalFilename: string | null };
const label: Record<Image["view"], string> = { FRONT: "Front", BACK: "Back", SIDE: "Side", ADDITIONAL: "More photos" };

export function StoreProductGallery({ images, productName }: { images: Image[]; productName: string }) {
  const available = images.filter((image) => image.imageUrl);
  const [selectedId, setSelectedId] = useState(available[0]?.id ?? "");
  const selected = available.find((image) => image.id === selectedId) ?? available[0];

  if (!selected) return <div className="grid aspect-square place-items-center rounded-2xl bg-[#f3f6f3] text-sm text-[#738078]">No product photos available</div>;

  return (
    <div className="grid gap-3">
      <div className="grid aspect-square place-items-center overflow-hidden rounded-2xl border border-[#e4eae5] bg-white p-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selected.imageUrl!} alt={`${productName} - ${label[selected.view]} view`} className="max-h-full w-full object-contain" />
      </div>
      <div className="grid grid-cols-4 gap-2" aria-label="Product photo views">
        {available.map((image, index) => (
          <button key={image.id} type="button" aria-pressed={selected.id === image.id} aria-label={`Show ${label[image.view]} view ${image.view === "ADDITIONAL" ? index + 1 : ""}`} onClick={() => setSelectedId(image.id)} className={`grid gap-1 rounded-lg border p-1 text-left text-xs ${selected.id === image.id ? "border-[#23664f] bg-[#eef5ef]" : "border-[#e4eae5] bg-white"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image.imageUrl!} alt="" className="aspect-square w-full rounded-md object-cover" />
            <span className="truncate px-1 text-[#425148]">{image.view === "ADDITIONAL" ? label.ADDITIONAL : label[image.view]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
