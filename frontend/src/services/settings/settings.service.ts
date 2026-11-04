import { apiRequest } from "@/lib/api";

export const settingsKeys = { all: ["settings"] as const, overview: () => ["settings", "overview"] as const };

export async function getSettingsOverview<Business, Branch>() {
  const [business, branches] = await Promise.all([
    apiRequest<{ data: Business }>("/business"),
    apiRequest<{ data: Branch[] }>("/branches"),
  ]);
  return { business: business.data, branches: branches.data };
}

export function updateBusinessSettings(input: Record<string, unknown>) {
  return apiRequest("/business", { method: "PATCH", body: JSON.stringify(input) });
}

export function createBranch(input: Record<string, unknown>) {
  return apiRequest("/branches", { method: "POST", body: JSON.stringify(input) });
}

export function updateBranch(id: string, input: Record<string, unknown>) {
  return apiRequest(`/branches/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) });
}
