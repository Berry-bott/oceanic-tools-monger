import { apiRequest } from "@/lib/api";

type Captured<T> = { data: T } | { error: string };
async function capture<T>(request: Promise<T>): Promise<Captured<T>> {
  try {
    return { data: await request };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The data could not be loaded." };
  }
}

export const dashboardKeys = {
  all: ["dashboard"] as const,
  overview: (keyParts: readonly unknown[]) => [...dashboardKeys.all, ...keyParts] as const,
};

export async function getDashboardOverview<Dashboard>(args: {
  role: string;
  branchId: string;
  from: string;
  to: string;
  today: string;
  previousFrom: string;
  previousTo: string;
}): Promise<Dashboard> {
  const branchQuery = args.branchId ? `&branchId=${encodeURIComponent(args.branchId)}` : "";
  const reportQuery = `from=${args.from}&to=${args.to}${branchQuery}`;
  const todayQuery = `from=${args.today}&to=${args.today}${branchQuery}`;
  const previousQuery = `from=${args.previousFrom}&to=${args.previousTo}${branchQuery}`;
  const canSeeFinance = args.role === "OWNER" || args.role === "STAFF";
  const canSeeInventory = args.role === "OWNER" || args.role === "STAFF";
  const canSeeOrders = args.role === "OWNER" || args.role === "STAFF";

  const [sales, movements, purchases, receipts, notifications, business, period, previous, today, inventory, receivables, payables, reconciliation, orders] = await Promise.all([
    capture(apiRequest(`/sales${args.branchId ? `?branchId=${encodeURIComponent(args.branchId)}` : ""}`)),
    canSeeInventory ? capture(apiRequest(`/inventory/movements?limit=30${args.branchId ? `&branchId=${encodeURIComponent(args.branchId)}` : ""}`)) : Promise.resolve(undefined),
    canSeeInventory ? capture(apiRequest(`/purchases${args.branchId ? `?branchId=${encodeURIComponent(args.branchId)}` : ""}`)) : Promise.resolve(undefined),
    canSeeFinance ? capture(apiRequest(`/reports/purchases?${reportQuery}`)) : Promise.resolve(undefined),
    capture(apiRequest("/notifications")),
    capture(apiRequest("/business")),
    canSeeFinance ? capture(apiRequest(`/reports/weekly-performance?${reportQuery}`)) : Promise.resolve(undefined),
    canSeeFinance ? capture(apiRequest(`/reports/weekly-performance?${previousQuery}`)) : Promise.resolve(undefined),
    canSeeFinance ? capture(apiRequest(`/reports/weekly-performance?${todayQuery}`)) : Promise.resolve(undefined),
    capture(apiRequest(`/inventory/summary${args.branchId ? `?branchId=${encodeURIComponent(args.branchId)}` : ""}`)),
    canSeeFinance ? capture(apiRequest("/reports/receivables-aging")) : Promise.resolve(undefined),
    canSeeFinance ? capture(apiRequest("/reports/payables-aging")) : Promise.resolve(undefined),
    canSeeFinance ? capture(apiRequest(`/reports/cash-reconciliation?${reportQuery}`)) : Promise.resolve(undefined),
    canSeeOrders ? capture(apiRequest(`/online-orders${args.branchId ? `?branchId=${encodeURIComponent(args.branchId)}` : ""}`)) : Promise.resolve(undefined),
  ]);

  return { sales, movements, purchases, receipts, notifications, business, period, previous, today, inventory, receivables, payables, reconciliation, orders } as Dashboard;
}

export function markDashboardNotificationRead(notificationId: string) {
  return apiRequest(`/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: "POST",
  });
}
