"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { dashboardKeys, markDashboardNotificationRead } from "@/services/dashboard/dashboard.service";

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markDashboardNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
  });
}
