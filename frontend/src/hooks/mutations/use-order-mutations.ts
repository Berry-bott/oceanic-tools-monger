"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orderKeys, receivePickupPayment, transitionOnlineOrder } from "@/services/orders/orders.service";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";

export function useTransitionOnlineOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => transitionOnlineOrder(id, status),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: orderKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}

export function useReceivePickupPayment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      method,
      reference,
    }: {
      id: string;
      method: "CASH" | "BANK_TRANSFER" | "CARD";
      reference?: string;
    }) => receivePickupPayment(id, { method, reference }),
    onSuccess: async () => Promise.all([
      queryClient.invalidateQueries({ queryKey: orderKeys.all }),
      invalidateAdminSummaries(queryClient),
    ]),
  });
}
