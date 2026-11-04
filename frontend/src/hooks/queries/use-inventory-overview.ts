"use client";

import { useQuery } from "@tanstack/react-query";
import { getInventoryOverview, inventoryKeys } from "@/services/inventory/inventory.service";

export function useInventoryOverview<Summary, Movement, Transfer, Count, Lot>(branchId: string, enabled: boolean) {
  return useQuery({
    queryKey: inventoryKeys.overview(branchId),
    queryFn: () => getInventoryOverview<Summary, Movement, Transfer, Count, Lot>(branchId),
    enabled,
  });
}
