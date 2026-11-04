"use client";

import { useQuery } from "@tanstack/react-query";
import { customerKeys, getCustomers } from "@/services/customers/customer.service";

export function useCustomers<Customer>(search = "") {
  return useQuery({
    queryKey: [...customerKeys.list(), search] as const,
    queryFn: () => getCustomers<Customer>(search),
  });
}
