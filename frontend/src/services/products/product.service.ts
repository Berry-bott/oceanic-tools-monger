import { apiRequest } from "@/lib/api";

export type Product = {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  description?: string | null;
  category: string;
  categoryId?: string | null;
  subcategory?: string | null;
  subcategoryId?: string | null;
  brand?: string | null;
  model?: string | null;
  unit: string;
  state: "DRAFT" | "ACTIVE" | "INACTIVE" | "ARCHIVED";
  sellingPrice: number | string;
  costPrice?: number | string;
  reorderLevel: number | string;
  imageUrl?: string | null;
  isPublished?: boolean;
  productImages?: ProductImage[];
  specifications?: { id: string; name: string; value: string; position: number }[];
  balances: { branchId: string; onHand: number | string; reserved: number | string; branch?: { name: string } }[];
};

export type ProductImage = {
  id: string;
  view: "FRONT" | "BACK" | "SIDE" | "ADDITIONAL";
  position: number;
  isPrimary: boolean;
  mediaAsset: { id: string; secureUrl: string | null; publicId: string; originalFilename: string | null; mimeType: string | null; status: string };
};

export type ProductResponse = { data: Product[]; meta: { count: number; limit: number } };
export type CreateProductInput = Record<string, unknown>;
export type ProductDuplicate = Pick<Product, "id" | "sku" | "name"> & {
  barcode?: string | null;
  category?: string;
};

export const productKeys = {
  all: ["products"] as const,
  list: (search: string) => [...productKeys.all, "list", search] as const,
};

export function getProducts(search = "") {
  const params = new URLSearchParams();
  if (search.trim()) params.set("search", search.trim());
  const query = params.toString();
  return apiRequest<ProductResponse>(`/products${query ? `?${query}` : ""}`);
}

export function createProduct(input: CreateProductInput) {
  return apiRequest<{ data: Product; possibleMatches: ProductDuplicate[]; openingStockValue: number }>("/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function checkProductDuplicates(input: { sku?: string; barcode?: string; name?: string }) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value?.trim()) params.set(key, value.trim());
  }
  return apiRequest<{ data: ProductDuplicate[]; exactMatches: boolean }>(`/products/check-duplicates?${params}`);
}

export function updateProductState(id: string, state: Product["state"]) {
  return apiRequest<{ data: Product }>(`/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ state }),
  });
}

export function getProduct(id: string) {
  return apiRequest<{ data: Product }>(`/products/${encodeURIComponent(id)}`);
}

export function updateProduct(id: string, input: Record<string, unknown>) {
  return apiRequest<{ data: Product }>(`/products/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function parseProductImport(file: File) {
  let response: { data: { rows: Record<string, unknown>[] } };
  if (file.name.toLowerCase().endsWith(".csv")) {
    response = await apiRequest<{ data: { rows: Record<string, unknown>[] } }>("/products/import/csv/parse", {
      method: "POST",
      body: JSON.stringify({ csv: await file.text() }),
    });
  } else {
    response = await apiRequest<{ data: { rows: Record<string, unknown>[] } }>("/products/import/xlsx/parse", {
      method: "POST",
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
      body: file,
    });
  }
  return response;
}

export function validateProductImport(rows: Record<string, unknown>[], branchId?: string) {
  return apiRequest<{ data: { branchId: string; total: number; valid: number; invalid: number; rows: { row: number; status: string; errors: string[]; possibleMatch?: { name: string; sku: string } }[] } }>("/products/import/validate", {
    method: "POST",
    body: JSON.stringify({ rows, branchId }),
  });
}

export function commitProductImport(rows: Record<string, unknown>[], branchId?: string) {
  return apiRequest<{ data: { created: number; openingStockValue: number } }>("/products/import/commit", {
    method: "POST",
    body: JSON.stringify({ rows, branchId }),
  });
}

export function mergeProducts(input: { sourceProductId: string; targetProductId: string; reason: string }) {
  return apiRequest("/products/merge", { method: "POST", body: JSON.stringify(input) });
}

export function uploadProductImage(id: string, file: File, view: ProductImage["view"] = "FRONT", imageId?: string, isPrimary = false) {
  const form = new FormData();
  form.set("image", file);
  form.set("view", view);
  if (imageId) form.set("imageId", imageId);
  if (isPrimary) form.set("isPrimary", "true");
  return apiRequest(`/products/${id}/images`, { method: "POST", body: form });
}

export function removeProductImage(id: string) {
  return apiRequest<void>(`/products/${id}/image`, { method: "DELETE" });
}

export function removeProductGalleryImage(productId: string, imageId: string) {
  return apiRequest(`/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}`, { method: "DELETE" });
}

export function setPrimaryProductImage(productId: string, imageId: string) {
  return apiRequest(`/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(imageId)}/primary`, { method: "PATCH" });
}
