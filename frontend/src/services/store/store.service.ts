import { API_BASE_URL } from "@/lib/api";

export type StoreBranch = {
  id: string;
  name: string;
  address: string | null;
  isDefault: boolean;
  isPickupLocation: boolean;
};

export type StoreInfo = {
  id: string;
  name: string;
  storeSlug: string;
  currency: string;
  onlineDeliveryEnabled: boolean;
  onlineDeliveryFee: string | number;
  payOnPickupEnabled: boolean;
  branches: StoreBranch[];
};

export type StoreCategorySummary = {
  name: string;
  slug: string;
  count: number;
  image?: string | null;
  description?: string;
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

export type StoreProductReview = {
  rating: number;
  comment: string | null;
  createdAt: string;
  author: string;
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
  originalPrice: string | number | null;
  badge?: string | null;
  averageRating?: string | number | null;
  reviewCount: number;
  reviews?: StoreProductReview[];
  available: number;
  brand: string | null;
  model: string | null;
  createdAt?: string;
  specifications?: StoreProductSpecification[];
  images?: StoreProductImage[];
};

export type StoreProductStock = { productId: string; available: number };

export type StoreCollections = {
  trending: StoreProduct[];
  newArrivals: StoreProduct[];
};

export type CreateStoreOrderInput = {
  branchId?: string;
  customerId?: string;
  customerName: string;
  email: string;
  phone?: string;
  fulfillmentMethod: "DELIVERY" | "COLLECTION";
  paymentOption: "PAYSTACK" | "PAY_ON_PICKUP";
  deliveryAddress?: string;
  lines: { productId: string; quantity: number }[];
};

export type CreateStoreOrderResult = {
  orderNumber: string;
  status: string;
  payment: {
    authorizationUrl?: string;
    accessCode?: string;
    reference: string;
  };
  paymentDueAtPickup?: boolean;
  expiresAt: string | null;
};

export type VerifyPaymentResult = {
  status: "SUCCEEDED" | "FAILED" | "PENDING" | "DUE_AT_PICKUP";
  paidAt?: string;
  orderNumber: string;
  pickupLocation?: { name: string; address: string | null };
  order?: StoreOrderDetails;
};

export type StoreOrderDetails = {
  number: string;
  status: string;
  fulfillmentMethod: "DELIVERY" | "COLLECTION";
  deliveryAddress: string | null;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  deliveryFee: number | string;
  total: number | string;
  currency: string;
  createdAt: string;
  updatedAt: string;
  branch: { name: string; address: string | null };
  lines: {
    id: string;
    productName: string;
    sku: string;
    quantity: number | string;
    unitPrice: number | string;
    lineTotal: number | string;
  }[];
  payments: {
    method: string;
    status: string;
    amount: number | string;
    reference: string;
    paidAt: string | null;
  }[];
};

export async function fetchStoreInfo(storeSlug?: string): Promise<StoreInfo | null> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const res = await fetch(`${API_BASE_URL}/store/info${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return null;
  const json = await res.json().catch(() => null);
  return json?.data ?? null;
}

export async function fetchStoreStock(storeSlug?: string): Promise<StoreProductStock[]> {
  const params = new URLSearchParams();
  if (storeSlug) params.set("store", storeSlug);
  const queryString = params.toString();
  const query = queryString ? `?${queryString}` : "";
  const response = await fetch(`${API_BASE_URL}/store/stock${query}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not refresh product availability.");
  const payload = await response.json().catch(() => null);
  return payload?.data ?? [];
}

export async function fetchStoreProducts(storeSlug?: string, search?: string): Promise<StoreProduct[]> {
  const params = new URLSearchParams();
  if (storeSlug) params.set("store", storeSlug);
  if (search) params.set("search", search);
  const query = params.toString() ? `?${params.toString()}` : "";

  const res = await fetch(`${API_BASE_URL}/store/products${query}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not refresh store products.");
  const json = await res.json().catch(() => null);
  return json?.data ?? [];
}

export async function fetchStoreCategories(storeSlug?: string): Promise<StoreCategorySummary[]> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const res = await fetch(`${API_BASE_URL}/store/categories${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return [];
  const json = await res.json().catch(() => null);
  return json?.data ?? [];
}

export async function fetchStoreCollections(storeSlug?: string): Promise<StoreCollections> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const res = await fetch(`${API_BASE_URL}/store/collections${query}`, { cache: "no-store" }).catch(() => null);
  if (!res?.ok) return { trending: [], newArrivals: [] };
  const json = await res.json().catch(() => null);
  return json?.data ?? { trending: [], newArrivals: [] };
}

export async function fetchStoreProductBySku(sku: string, storeSlug?: string): Promise<StoreProduct | null> {
  const query = storeSlug ? `?store=${encodeURIComponent(storeSlug)}` : "";
  const url = `${API_BASE_URL}/store/products/${encodeURIComponent(sku)}${query}`;

  // Try up to 2 times with a short retry delay in case database compute is waking up
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (res.status === 404) return null;
      if (res.ok) {
        const json = await res.json() as { data?: StoreProduct };
        return json?.data ?? null;
      }
      if (res.status === 503 && attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      return null;
    } catch {
      if (attempt === 1) {
        await new Promise((resolve) => setTimeout(resolve, 800));
        continue;
      }
      return null;
    }
  }
  return null;
}

export type CustomerAccount = { customerId: string; email: string };
export async function getCustomerAccount(): Promise<CustomerAccount | null> {
  const response = await fetch(`${API_BASE_URL}/customer-account/me`, { credentials: "include", cache: "no-store" });
  if (response.status === 401) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || "Could not check customer sign-in status.");
  return payload?.data ?? null;
}

export async function loginStoreCustomer(input: { email: string; password: string }, storeSlug: string) {
  return customerAccountRequest(`/customer-account/login?store=${encodeURIComponent(storeSlug)}`, input);
}

export async function registerStoreCustomer(input: { name: string; email: string; phone?: string; password: string }, storeSlug: string) {
  return customerAccountRequest(`/customer-account/register?store=${encodeURIComponent(storeSlug)}`, input);
}

export async function submitProductReview(productId: string, input: { rating: number; comment: string }) {
  return customerAccountRequest(`/customer-account/products/${encodeURIComponent(productId)}/reviews`, input);
}

async function customerAccountRequest(path: string, body: unknown) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error?.message || `Customer account request failed (${response.status}).`);
  return payload?.data;
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

export async function trackStoreOrder(input: { orderNumber: string; email: string }): Promise<StoreOrderDetails> {
  const res = await fetch(`${API_BASE_URL}/store/orders/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify(input),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message || "We could not find an order matching those details.");
  }
  return json.data;
}

export async function trackStoreOrderForCustomer(orderNumber: string): Promise<StoreOrderDetails> {
  const res = await fetch(`${API_BASE_URL}/store/orders/track-authenticated`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    cache: "no-store",
    body: JSON.stringify({ orderNumber }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(json?.error?.message || "We could not find an order matching your account and order number.");
  }
  return json.data;
}
