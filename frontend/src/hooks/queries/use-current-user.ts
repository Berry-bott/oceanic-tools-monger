"use client";

import { useQuery } from "@tanstack/react-query";
import { authKeys, getCurrentUser } from "@/services/auth/auth.service";

export function useCurrentUser(enabled = true) {
  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: getCurrentUser,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}
