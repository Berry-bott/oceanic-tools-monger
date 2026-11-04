"use client";

import { useQuery } from "@tanstack/react-query";
import { branchKeys, getBranches } from "@/services/branches/branch.service";

export function useBranches<Branch>(enabled = true) {
  return useQuery({
    queryKey: branchKeys.all,
    queryFn: () => getBranches<Branch>(),
    enabled,
  });
}
