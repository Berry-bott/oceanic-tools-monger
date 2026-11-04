"use client";

import { useQuery } from "@tanstack/react-query";
import { getPurchasingOverview, purchasingKeys } from "@/services/purchasing/purchasing.service";

export function usePurchasingOverview<Supplier, Purchase>(enabled: boolean) {
  return useQuery({
    queryKey: purchasingKeys.overview(),
    queryFn: () => getPurchasingOverview<Supplier, Purchase>(),
    enabled,
  });
}
