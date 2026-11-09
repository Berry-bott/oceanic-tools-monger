import { API_BASE_URL } from "@/lib/api";

export type StoreBranch = {
  id: string;
  name: string;
  isDefault: boolean;
};

export type StoreInfo = {
  id: string;
  name: string;
  storeSlug: string;
  currency: string;
  branches: StoreBranch[];
};

export type StoreProductImage = {
  id: string;
  view: "FRONT" | "BACK" | "SIDE" | "ADDITIONAL";
  position: number;
  isPrimary?: boolean;
  imageUrl: string | null;
  originalFilename?: string | null;
  mimeType?: string | null;
};

export type StoreProductSpecification = {
  id: string;
  name: string;
  value: string;
};

export type StoreProduct = {
  id: string;
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
  specifications?: StoreProductSpecification[];
  images?: StoreProductImage[];
};

export type CreateStoreOrderInput = {
  branchId?: string;
  customerName: string;
  email: string;
  phone?: string;
  fulfillmentMethod: "DELIVERY" | "COLLECTION";
  deliveryAddress?: string;
  lines: { productId: string; quantity: number }[];
};

export type CreateStoreOrderResult = {
  orderNumber: string;
  status: string;
  payment: {
    authorizationUrl: string;
    accessCode: string;
    reference: string;
  };
  expiresAt: string;
};

export type VerifyPaymentResult = {
  status: "SUCCEEDED" | "FAILED" | "PENDING";
  paidAt?: string;
  orderNumber: string;
};

export async function fetchStoreInfo(storeSlug?: string): Promise<StoreInfo | null> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const res = await fetch(`${API_BASE_URL}/store/info${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.data ?? null;
}

export async function fetchStoreProducts(storeSlug?: string, search?: string): Promise<StoreProduct[]> {
  const params = new URLSearchParams();
  if (storeSlug) params.set("store", storeSlug);
  if (search) params.set("search", search);
  const query = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${API_BASE_URL}/store/products${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  const json = await res.json().catch(() => null);
  return json?.data ?? [];
}

export async function fetchStoreProductBySku(sku: string, storeSlug?: string): Promise<StoreProduct | null> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const res = await fetch(`${API_BASE_URL}/store/products/${encodeURIComponent(sku)}${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.data ?? null;
}

export async function createStoreOrder(input: CreateStoreOrderInput, storeSlug?: string): Promise<CreateStoreOrderResult> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const res = await fetch(`${API_BASE_URL}/store/orders${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message || "Failed to create order. Please try again.");
  }
  return json.data;
}

export async function verifyStorePayment(reference: string): Promise<VerifyPaymentResult> {
  const res = await fetch(`${API_BASE_URL}/store/payments/${encodeURIComponent(reference)}/verify`, {
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message || "Payment verification failed.");
  }
  return json.data;
}
