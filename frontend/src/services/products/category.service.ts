import { apiRequest } from "@/lib/api";

export type ProductCategory = {
  id: string;
  name: string;
  subcategories: { id: string; name: string }[];
};

export const categoryKeys = { all: ["product-categories"] as const };

export function getProductCategories() {
  return apiRequest<{ data: ProductCategory[] }>("/products/categories");
}

export function createProductCategory(name: string, subcategoryName?: string) {
  return apiRequest<{ data: ProductCategory }>("/products/categories", {
    method: "POST",
    body: JSON.stringify({ name, subcategoryName }),
  });
}

export function updateProductCategory(id: string, name: string) {
  return apiRequest<{ data: ProductCategory }>(`/products/categories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteProductCategory(id: string) {
  return apiRequest<void>(`/products/categories/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function createProductSubcategory(categoryId: string, name: string) {
  return apiRequest<{ data: { id: string; name: string } }>(`/products/categories/${encodeURIComponent(categoryId)}/subcategories`, {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateProductSubcategory(categoryId: string, id: string, name: string) {
  return apiRequest<{ data: { id: string; name: string } }>(`/products/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteProductSubcategory(categoryId: string, id: string) {
  return apiRequest<void>(`/products/categories/${encodeURIComponent(categoryId)}/subcategories/${encodeURIComponent(id)}`, { method: "DELETE" });
}
