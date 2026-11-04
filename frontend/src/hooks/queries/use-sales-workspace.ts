"use client";

import { useQuery } from "@tanstack/react-query";
import { getSalesWorkspace, salesKeys } from "@/services/sales/sales.service";

export function useSalesWorkspace<Sale, Shift>(branchId: string, includeShift: boolean, enabled: boolean) {
  return useQuery({
    queryKey: salesKeys.workspace(branchId, includeShift),
    queryFn: () => getSalesWorkspace<Sale, Shift>(branchId, includeShift),
    enabled,
  });
}
