"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import {
  createProduct,
  productKeys,
  removeProductImage,
  updateProductState,
  uploadProductImage,
  type CreateProductInput,
  type Product,
} from "@/services/products/product.service";

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => createProduct(input),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: productKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}

export function useUpdateProductState() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, state }: { id: string; state: Product["state"] }) => updateProductState(id, state),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: productKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}

export function useUploadProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file, view, imageId, isPrimary }: { id: string; file: File; view?: "FRONT" | "BACK" | "SIDE" | "ADDITIONAL"; imageId?: string; isPrimary?: boolean }) => uploadProductImage(id, file, view, imageId, isPrimary),
    onSuccess: async (_data, variables) => Promise.all([queryClient.invalidateQueries({ queryKey: productKeys.all }), queryClient.invalidateQueries({ queryKey: [...productKeys.all, variables.id] }), invalidateAdminSummaries(queryClient)]),
  });
}

export function useRemoveProductImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => removeProductImage(id),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: productKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}
