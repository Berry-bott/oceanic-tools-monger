import { apiRequest } from "@/lib/api";

export const businessKeys = { current: ["business", "current"] as const };

export function getBusiness<Business>() {
  return apiRequest<{ data: Business }>("/business");
}
