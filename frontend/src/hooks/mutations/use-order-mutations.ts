"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orderKeys, transitionOnlineOrder } from "@/services/orders/orders.service";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";

export function useTransitionOnlineOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => transitionOnlineOrder(id, status),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: orderKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}
