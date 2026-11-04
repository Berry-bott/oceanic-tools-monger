import { apiRequest } from "@/lib/api";

export const inventoryKeys = {
  all: ["inventory"] as const,
  overview: (branchId: string) => [...inventoryKeys.all, "overview", branchId] as const,
};

export async function getInventoryOverview<Summary, Movement, Transfer, Count, Lot>(branchId: string) {
  const branchQuery = branchId ? `branchId=${encodeURIComponent(branchId)}` : "";
  const suffix = branchQuery ? `?${branchQuery}` : "";
  const movementSuffix = branchQuery ? `?${branchQuery}&limit=50` : "?limit=50";
  const [summary, movements, transfers, counts, lots] = await Promise.all([
    apiRequest<Summary>(`/inventory/summary${suffix}`),
    apiRequest<{ data: Movement[] }>(`/inventory/movements${movementSuffix}`),
    apiRequest<{ data: Transfer[] }>("/inventory/transfers"),
    apiRequest<{ data: Count[] }>("/inventory/counts"),
    branchId
      ? apiRequest<{ data: Lot[] }>(`/inventory/lots?branchId=${encodeURIComponent(branchId)}`)
      : Promise.resolve({ data: [] as Lot[] }),
  ]);
  return {
    summary,
    movements: movements.data,
    transfers: transfers.data,
    counts: counts.data,
    lots: lots.data,
  };
}

function postWorkflow<T>(path: string, input?: unknown) {
  return apiRequest<T>(path, {
    method: "POST",
    ...(input === undefined ? {} : { body: JSON.stringify(input) }),
  });
}

export function createStockTransfer(input: unknown) { return postWorkflow("/inventory/transfers", input); }
export function createStockCount(input: unknown) { return postWorkflow("/inventory/counts", input); }
export function adjustProductStock(productId: string, input: unknown) { return postWorkflow(`/products/${encodeURIComponent(productId)}/adjustments`, input); }
export function dispatchStockTransfer(id: string) { return postWorkflow(`/inventory/transfers/${encodeURIComponent(id)}/dispatch`); }
export function receiveStockTransfer(id: string) { return postWorkflow(`/inventory/transfers/${encodeURIComponent(id)}/receive`); }
export function submitStockCount(id: string) { return postWorkflow(`/inventory/counts/${encodeURIComponent(id)}/submit`); }
export function approveStockCount(id: string) { return postWorkflow(`/inventory/counts/${encodeURIComponent(id)}/approve`); }
export function postStockCount(id: string) { return postWorkflow(`/inventory/counts/${encodeURIComponent(id)}/post`); }
