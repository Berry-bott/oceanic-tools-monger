"use client";

import { useQuery } from "@tanstack/react-query";
import { getStaffMembers, staffKeys } from "@/services/staff/staff.service";

export function useStaffMembers(enabled = true) {
  return useQuery({
    queryKey: staffKeys.list(),
    queryFn: getStaffMembers,
    enabled,
    staleTime: 30_000,
  });
}
