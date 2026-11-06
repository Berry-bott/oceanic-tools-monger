import { apiRequest } from "@/lib/api";

export const creditorKeys = { all: ["creditors"] as const };

export type Creditor = {
  id: string;
  name: string;
  type: "PERSONAL" | "COMPANY";
  companyName: string | null;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: number | string | null;
  creditDays: number;
  outstandingBalance: number;
  overdueBalance: number;
  sales: CreditorSale[];
};

export type CreditorSale = {
  id: string;
  number: string;
  total: number | string;
  dueAt: string | null;
  creditReference: string | null;
  createdAt: string;
  branch: { id: string; name: string };
  lines: { productName: string; quantity: number | string }[];
  payments: { amount: number | string; payment: { status: string } }[];
  returns: { total: number | string }[];
};

export function getCreditors() {
  return apiRequest<{ data: Creditor[] }>("/creditors");
}

export function createCreditor(input: Record<string, unknown>) {
  return apiRequest<{ data: Creditor }>("/creditors", { method: "POST", body: JSON.stringify(input) });
}

export function updateCreditor(id: string, input: Record<string, unknown>) {
  return apiRequest<{ data: Creditor }>(`/creditors/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}
