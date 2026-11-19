"use client";

import { useQuery } from "@tanstack/react-query";
import { getProducts, productKeys } from "@/services/products/product.service";

export function useProducts(search: string = "", limit?: number) {
  return useQuery({
    queryKey: productKeys.list(search, limit),
    queryFn: () => getProducts(search, limit),
  });
}
