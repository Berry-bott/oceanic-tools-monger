import { apiRequest } from "@/lib/api";

export const branchKeys = { all: ["branches"] as const };

export function getBranches<Branch>() {
  return apiRequest<{ data: Branch[] }>("/branches");
}
