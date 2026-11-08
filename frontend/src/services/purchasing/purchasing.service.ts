import { apiRequest } from "@/lib/api";

export const purchasingKeys = { all: ["purchasing"] as const, overview: () => ["purchasing", "overview"] as const };

export async function getPurchasingOverview<Supplier, Purchase>() {
  const [suppliers, purchases] = await Promise.all([
    apiRequest<{ data: Supplier[] }>("/suppliers"),
    apiRequest<{ data: Purchase[] }>("/purchases"),
  ]);
  return { suppliers: suppliers.data, orders: purchases.data };
}

export function createSupplier(input: Record<string, unknown>) {
  return apiRequest<{ data: { id: string; name: string } }>("/suppliers", { method: "POST", body: JSON.stringify(input) });
}

export function createPurchaseOrder(input: Record<string, unknown>) {
  return apiRequest<{ data: { id: string; number: string; lines: { id: string }[] } }>("/purchases", { method: "POST", body: JSON.stringify(input) });
}

export function transitionPurchaseOrder(id: string, action: "submit" | "approve") {
  return apiRequest(`/purchases/${encodeURIComponent(id)}/${action}`, { method: "POST" });
}

export function receivePurchaseOrder(id: string, input: Record<string, unknown>) {
  return apiRequest(`/purchases/${encodeURIComponent(id)}/receive`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
