import { apiRequest } from "@/lib/api";

export const financeKeys = {
  all: ["finance"] as const,
  overview: () => [...financeKeys.all, "overview"] as const,
};

export async function getFinanceOverview<Expense, Invoice, ProfitLoss, BalanceSheet, Account, Journal>() {
  const [expenses, payables, profitLoss, balanceSheet, accounts, journals] =
    await Promise.all([
      apiRequest<{ data: Expense[] }>("/expenses"),
      apiRequest<{ data: Invoice[]; summary: { totalOutstanding: number } }>("/payments/payables"),
      apiRequest<ProfitLoss>("/reports/profit-loss"),
      apiRequest<BalanceSheet>("/reports/balance-sheet"),
      apiRequest<{ data: Account[] }>("/accounting/accounts"),
      apiRequest<{ data: Journal[] }>("/accounting/journal-entries"),
    ]);

  return {
    expenses: expenses.data,
    invoices: payables.data,
    profitLoss,
    balanceSheet,
    accounts: accounts.data,
    journals: journals.data,
  };
}

export function recordExpense(input: Record<string, unknown>) {
  return apiRequest("/expenses", { method: "POST", body: JSON.stringify(input) });
}

export function createJournalEntry(input: Record<string, unknown>) {
  return apiRequest("/accounting/journal-entries", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function postJournalEntry(id: string) {
  return apiRequest(`/accounting/journal-entries/${encodeURIComponent(id)}/post`, {
    method: "POST",
  });
}

export function paySupplierInvoice(id: string, input: Record<string, unknown>) {
  return apiRequest(`/payments/supplier-invoices/${encodeURIComponent(id)}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
