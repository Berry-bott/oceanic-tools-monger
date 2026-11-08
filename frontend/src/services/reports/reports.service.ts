import { apiDownload, apiRequest } from "@/lib/api";

export const adminReportOptions = [
  { label: "Sales and profit", path: "weekly-performance", dated: true, branch: true },
  { label: "Expenses", path: "expenses", dated: true, branch: true },
  { label: "Profit and loss", path: "profit-loss", dated: true, branch: false },
  { label: "Balance sheet", path: "balance-sheet", dated: true, branch: false },
  { label: "Cash flow", path: "cash-flow", dated: true, branch: false },
  { label: "Tax summary", path: "tax", dated: true, branch: true },
  { label: "Inventory value", path: "inventory-valuation", dated: false, branch: false },
  { label: "Stock operations", path: "stock-operations", dated: false, branch: true },
  { label: "Purchases", path: "purchases", dated: true, branch: true },
  { label: "Purchase cohort", path: "purchase-cohort", dated: true, branch: false },
  { label: "Money customers owe", path: "receivables-aging", dated: false, branch: false },
  { label: "Customer payments", path: "customer-payments", dated: true, branch: true },
  { label: "Supplier bills owed", path: "payables-aging", dated: false, branch: false },
  { label: "Supplier balances by company", path: "supplier-balances", dated: false, branch: false },
  { label: "Cash reconciliation", path: "cash-reconciliation", dated: true, branch: true },
] as const;

export type AdminReportPath = (typeof adminReportOptions)[number]["path"];
export function getAdminReport<T>(path: AdminReportPath, params: URLSearchParams) {
  return apiRequest<T>(`/reports/${path}?${params.toString()}`);
}
export function downloadAdminReport(path: AdminReportPath, params: URLSearchParams, format: "csv" | "xlsx" | "pdf") {
  const query = new URLSearchParams(params);
  query.set("format", format);
  return apiDownload(`/reports/${path}?${query.toString()}`);
}
