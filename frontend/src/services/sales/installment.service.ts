import { apiRequest } from "@/lib/api";

export const installmentKeys = { all: ["installments"] as const };

export function getInstallmentAgreements<Agreement>() {
  return apiRequest<{ data: Agreement[] }>("/installments");
}

export function createInstallmentAgreement(input: Record<string, unknown>) {
  return apiRequest("/installments", { method: "POST", body: JSON.stringify(input) });
}

export function recordInstallmentPayment(agreementId: string, installmentId: string, input: Record<string, unknown>) {
  return apiRequest(`/installments/${encodeURIComponent(agreementId)}/installments/${encodeURIComponent(installmentId)}/payments`, { method: "POST", body: JSON.stringify(input) });
}

export function extendInstallmentDeadline(agreementId: string, installmentId: string, input: Record<string, unknown>) {
  return apiRequest(`/installments/${encodeURIComponent(agreementId)}/installments/${encodeURIComponent(installmentId)}/extend`, { method: "POST", body: JSON.stringify(input) });
}

export function cancelInstallmentAgreement(agreementId: string, input: Record<string, unknown>) {
  return apiRequest(`/installments/${encodeURIComponent(agreementId)}/cancel`, { method: "POST", body: JSON.stringify(input) });
}
