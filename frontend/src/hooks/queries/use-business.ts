"use client";

import { useQuery } from "@tanstack/react-query";
import { businessKeys, getBusiness } from "@/services/business/business.service";

export function useBusiness<Business>() {
  return useQuery({ queryKey: businessKeys.current, queryFn: () => getBusiness<Business>() });
}
