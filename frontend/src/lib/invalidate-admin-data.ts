import type { QueryClient } from "@tanstack/react-query";

/** Mark summary views stale after writes so cached pages refresh when revisited. */
export function invalidateAdminSummaries(queryClient: QueryClient) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
    queryClient.invalidateQueries({ queryKey: ["admin-report"] }),
  ]);
}
