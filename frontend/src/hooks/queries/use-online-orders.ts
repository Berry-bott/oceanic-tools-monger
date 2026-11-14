"use client";

import { useQuery } from "@tanstack/react-query";
import { getOnlineOrders, orderKeys } from "@/services/orders/orders.service";

export function useOnlineOrders<Order>(branchId: string, enabled = true) {
  return useQuery({
    queryKey: orderKeys.list(branchId),
    queryFn: () => getOnlineOrders<Order>(branchId),
    enabled,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}
