"use client";

import { useQuery } from "@tanstack/react-query";
import { customerKeys, getCustomerStatement } from "@/services/customers/customer.service";

export function useCustomerStatement<Statement>(customerId: string) {
  return useQuery({
    queryKey: customerKeys.statement(customerId),
    queryFn: () => getCustomerStatement<Statement>(customerId),
    enabled: Boolean(customerId),
  });
}
