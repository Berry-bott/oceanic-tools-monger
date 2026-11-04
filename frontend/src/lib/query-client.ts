import { QueryClient } from "@tanstack/react-query";

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Keep route data warm while users move around the admin workspace.
        // Writes invalidate their related keys so changed data appears promptly.
        staleTime: 5 * 60_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          const status = "status" in error ? Number(error.status) : undefined;
          return status !== undefined && status >= 400 && status < 500
            ? false
            : failureCount < 1;
        },
      },
      mutations: { retry: false },
    },
  });
}
