"use client";

import { useQuery } from "@tanstack/react-query";
import { financeKeys, getFinanceOverview } from "@/services/finance/finance.service";

export function useFinanceOverview<Expense, Invoice, ProfitLoss, BalanceSheet, Account, Journal>(enabled: boolean) {
  return useQuery({
    queryKey: financeKeys.overview(),
    queryFn: () => getFinanceOverview<Expense, Invoice, ProfitLoss, BalanceSheet, Account, Journal>(),
    enabled,
  });
}
