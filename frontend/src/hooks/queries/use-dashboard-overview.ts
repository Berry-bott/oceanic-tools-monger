"use client";

import { useQuery } from "@tanstack/react-query";
import { dashboardKeys, getDashboardOverview } from "@/services/dashboard/dashboard.service";

export function useDashboardOverview<Dashboard>(args: {
  role: string;
  branchId: string;
  from: string;
  to: string;
  today: string;
  previousFrom: string;
  previousTo: string;
  timezone?: string;
  enabled?: boolean;
}) {
  const { timezone, enabled = true, ...request } = args;
  return useQuery({
    queryKey: dashboardKeys.overview([
      request.role,
      request.branchId,
      request.from,
      request.to,
      request.today,
      request.previousFrom,
      request.previousTo,
      timezone ?? "local",
    ]),
    queryFn: () => getDashboardOverview<Dashboard>(request),
    enabled: enabled && Boolean(request.from && request.to),
    refetchInterval: 5 * 60_000,
    refetchIntervalInBackground: false,
  });
}
