"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryKeys } from "@/services/inventory/inventory.service";
import { productKeys } from "@/services/products/product.service";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";

export function useInventoryWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (request: () => Promise<unknown>) => request(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: inventoryKeys.all }),
        queryClient.invalidateQueries({ queryKey: productKeys.all }),
        invalidateAdminSummaries(queryClient),
      ]);
    },
  });
}
