import { notFound } from "next/navigation";
import { API_BASE_URL } from "@/lib/api";
import { StoreProductGallery } from "@/components/store-product-gallery";

type StoreProduct = {
  name: string;
  sku: string;
  category: string;
  subcategory: string | null;
  description: string | null;
  unit: string;
  sellingPrice: string | number;
  available: number;
  brand: string | null;
  model: string | null;
  specifications: { id: string; name: string; value: string }[];
  images: { id: string; view: "FRONT" | "BACK" | "SIDE" | "ADDITIONAL"; imageUrl: string | null; originalFilename: string | null; isPrimary: boolean }[];
};

export default async function StoreProductPage({ params }: { params: Promise<{ storeSlug: string; sku: string }> }) {
  const { storeSlug, sku } = await params;
  const query = new URLSearchParams({ store: storeSlug });
  const response = await fetch(`${API_BASE_URL}/store/products/${encodeURIComponent(sku)}?${query}`, { cache: "no-store" }).catch(() => null);
  if (!response?.ok) notFound();
  const result = await response.json() as { data?: StoreProduct };
  const product = result.data;
  if (!product) notFound();
  const price = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(Number(product.sellingPrice));

  return (
    <main className="mx-auto grid min-h-screen w-full max-w-6xl content-start gap-8 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:gap-14 lg:px-8 lg:py-14">
      <StoreProductGallery images={product.images ?? []} productName={product.name} />
      <section className="grid content-start gap-5 py-2">
        <p className="m-0 text-sm font-medium uppercase tracking-wide text-[#4f8060]">{product.category}{product.subcategory ? ` / ${product.subcategory}` : ""}</p>
        <h1 className="m-0 text-3xl font-semibold tracking-tight text-[#1d3129] sm:text-4xl">{product.name}</h1>
        <p className="m-0 text-2xl font-medium text-[#23664f]">{price}<span className="ml-2 text-sm text-[#75827c]">per {product.unit}</span></p>
        <p className="m-0 text-sm leading-7 text-[#65736a]">{product.description || "Contact the store for more information about this product."}</p>
        <p className="m-0 text-sm text-[#536159]">{product.available > 0 ? "Available now" : "Currently out of stock"}</p>
        <p className="m-0 text-xs text-[#89958e]">Product code: {product.sku}</p>
        {(product.brand || product.model) && <p className="m-0 text-sm text-[#536159]">{[product.brand, product.model].filter(Boolean).join(" · ")}</p>}
        {product.specifications.length > 0 && (
          <section className="mt-2 grid gap-3 border-t border-line pt-5" aria-labelledby="product-specifications-title">
            <h2 id="product-specifications-title" className="m-0 text-lg font-semibold text-[#1d3129]">Product details</h2>
            <dl className="m-0 grid gap-2 sm:grid-cols-2">{product.specifications.map((specification) => <div key={specification.id} className="flex items-start justify-between gap-4 rounded-lg bg-canvas px-3 py-2.5 text-sm"><dt className="text-[#75827c]">{specification.name}</dt><dd className="m-0 text-right text-[#34413a]">{specification.value}</dd></div>)}</dl>
          </section>
        )}
      </section>
    </main>
  );
}
