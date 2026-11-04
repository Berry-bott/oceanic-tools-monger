import { apiRequest } from "@/lib/api";

export const orderKeys = {
  all: ["online-orders"] as const,
  list: (branchId: string) => [...orderKeys.all, branchId] as const,
};

export function getOnlineOrders<Order>(branchId: string) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : "";
  return apiRequest<{ data: Order[]; counts: Record<string, number> }>(`/online-orders${query}`);
}

export function transitionOnlineOrder(id: string, status: string) {
  return apiRequest(`/online-orders/${encodeURIComponent(id)}/transition`, {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
