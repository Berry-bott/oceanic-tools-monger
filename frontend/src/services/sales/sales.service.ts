import { apiRequest } from "@/lib/api";

export const salesKeys = {
  all: ["sales"] as const,
  workspace: (branchId: string, includeShift: boolean) =>
    [...salesKeys.all, "workspace", branchId, includeShift] as const,
};

export async function getSalesWorkspace<Sale, Shift>(branchId: string, includeShift: boolean) {
  const salesPath = branchId ? `/sales?branchId=${encodeURIComponent(branchId)}` : "/sales";
  const [sales, shift] = await Promise.all([
    apiRequest<{ data: Sale[] }>(salesPath),
    includeShift
      ? apiRequest<{ data: Shift }>("/sales/shifts/current")
      : Promise.resolve({ data: null as Shift }),
  ]);
  return { sales: sales.data, shift: shift.data };
}

export function openCashShift(input: Record<string, unknown>) {
  return apiRequest("/sales/shifts/open", { method: "POST", body: JSON.stringify(input) });
}

export function closeCashShift<CloseResult>(shiftId: string, closingCash: number) {
  return apiRequest<CloseResult>(`/sales/shifts/${encodeURIComponent(shiftId)}/close`, {
    method: "POST",
    body: JSON.stringify({ closingCash }),
  });
}

export function createPosSale<Sale>(input: Record<string, unknown>, idempotencyKey: string) {
  return apiRequest<{ data: Sale }>("/sales", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
}

export function createSaleReturn<ReturnResult>(saleId: string, input: Record<string, unknown>) {
  return apiRequest<ReturnResult>(`/sales/${encodeURIComponent(saleId)}/returns`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function lookupSaleForReturn<Sale>(reference: string) {
  return apiRequest<{ data: Sale }>(`/sales/lookup?reference=${encodeURIComponent(reference)}`);
}

export function approveSaleRefund(returnId: string) {
  return apiRequest(`/sales/returns/${encodeURIComponent(returnId)}/approve-refund`, {
    method: "POST",
  });
}

export function getCustomerReturnRequests<ReturnRequest>() {
  return apiRequest<{ data: ReturnRequest[] }>("/sales/return-requests");
}

export function resolveCustomerReturnRequest(returnId: string, input: { decision: "APPROVE" | "REJECT"; method?: "BANK_TRANSFER" | "CASH" | "OTHER" | "PAYSTACK"; note?: string }) {
  return apiRequest<{ data: { status: string; refundAmount?: number; refundStatus?: string } }>(`/sales/returns/${encodeURIComponent(returnId)}/resolve-request`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function switchFailedRefundToManual(returnId: string, method: "BANK_TRANSFER" | "CASH" | "OTHER") {
  return apiRequest(`/sales/returns/${encodeURIComponent(returnId)}/fallback-refund`, {
    method: "POST",
    body: JSON.stringify({ method }),
  });
}
