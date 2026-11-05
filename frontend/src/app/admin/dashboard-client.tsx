"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { statusPill } from "@/lib/ui";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { downloadWeeklyPerformance } from "@/services/reports/report.service";
import { useDashboardOverview } from "@/hooks/queries/use-dashboard-overview";
import { useBranches } from "@/hooks/queries/use-branches";
import { useMarkNotificationRead } from "@/hooks/mutations/use-mark-notification-read";
import { useBranchStore } from "@/stores/branch.store";
import {
  DashboardDataError,
  DashboardFilters,
  DashboardIcon,
  DashboardMetricCard,
  DashboardPageHeading,
  DashboardSalesChart,
} from "@/components/admin-dashboard-widgets";

type Role = "OWNER" | "STAFF";
type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  businessId: string;
};
type Branch = { id: string; name: string; isDefault: boolean };
type Business = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  branches: Branch[];
};
type WeeklyReport = {
  period: { from: string; to: string; timezone: string };
  currency: string;
  salesCount: number;
  grossSales: number;
  discounts: number;
  salesReturns: number;
  netSales: number;
  cashCollected: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  operatingExpenses: number;
  gatewayFees: number;
  netProfit: number;
  byDay: { date: string; netSales: number; grossProfit: number }[];
  byChannel: { channel: string; amount: number }[];
  topProducts: {
    productId: string;
    product: string;
    sku: string;
    quantity: number;
    revenue: number;
    grossProfit: number;
  }[];
};
type ValuationRow = {
  productId: string;
  name: string;
  sku: string;
  branch: string;
  onHand: number;
  reserved: number;
  available: number;
  unitCost?: number;
  inventoryValue?: number;
  reorderLevel: number;
};
type InventorySummary = {
  inventoryValue?: number;
  balanceCount: number;
  productCount: number;
  onHandUnits: number;
  reservedUnits: number;
  availableUnits: number;
  lowStockCount: number;
  outOfStockCount: number;
  expiringWithin30Days: number;
};
type AgingReport = {
  buckets: Record<string, number>;
  totalOutstanding: number;
  data: {
    number?: string;
    invoiceNumber?: string;
    customer?: string;
    supplier?: string;
    outstanding: number;
    daysOverdue: number;
    bucket: string;
  }[];
};
type CashReport = {
  data: {
    shiftId: string;
    cashier: string;
    branch: string;
    closedAt: string;
    expectedCash: number;
    countedCash: number;
    variance: number;
  }[];
  unsettledGatewayPayments: {
    id: string;
    reference: string;
    amount: number;
    paidAt: string;
  }[];
  summary: {
    totalVariance: number;
    unsettledGatewayAmount: number;
    currency: string;
  };
};
type Sale = {
  id: string;
  number: string;
  channel: string;
  status: string;
  total: number | string;
  createdAt: string;
  user?: { name: string };
  customer?: { name: string };
};
type Movement = {
  id: string;
  type: string;
  quantity: number | string;
  createdAt: string;
  product: { name: string; sku: string };
  branch: { name: string };
  user?: { name: string };
};
type Purchase = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  supplier: { name: string };
  branch: { name: string };
};
type PurchaseReceipt = {
  receipt: string;
  date: string;
  supplier: string;
  product: string;
  sku: string;
  quantity: number;
  rejected: number;
  total: number;
};
type OnlineOrder = {
  id: string;
  number: string;
  status: string;
  createdAt: string;
  total: number | string;
};
type Notification = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
  entityType?: string;
  entityId?: string;
};
type Result<T> = { data?: T; error?: string };
type HomeData = {
  business?: Result<{ data: Business }>;
  branches?: Result<{ data: Branch[] }>;
  period?: Result<{ data: WeeklyReport }>;
  previous?: Result<{ data: WeeklyReport }>;
  today?: Result<{ data: WeeklyReport }>;
  inventory?: Result<{ data: ValuationRow[]; summary: InventorySummary }>;
  receivables?: Result<AgingReport>;
  payables?: Result<AgingReport>;
  reconciliation?: Result<CashReport>;
  sales?: Result<{ data: Sale[] }>;
  movements?: Result<{ data: Movement[] }>;
  purchases?: Result<{ data: Purchase[] }>;
  receipts?: Result<{ data: PurchaseReceipt[] }>;
  orders?: Result<{ data: OnlineOrder[]; counts?: Record<string, number> }>;
  notifications?: Result<{ data: Notification[]; unreadCount: number }>;
};

const canSeeFinance = (role: Role) => role === "OWNER" || role === "STAFF";
const canSeeOrders = (role: Role) => role === "OWNER" || role === "STAFF";
const canSeeCustomers = (role: Role) => role === "OWNER" || role === "STAFF";
const canManageInventory = (role: Role) =>
  ["OWNER", "STAFF"].includes(role);
const canUsePos = (role: Role) => ["OWNER", "STAFF"].includes(role);
const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const dateInTimezone = (date: Date, timezone?: string) => {
  if (!timezone) return localDate(date);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const addCalendarDays = (date: string, days: number) => {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
};
const rangeFor = (preset: string, timezone?: string) => {
  const endDate = dateInTimezone(new Date(), timezone);
  if (preset === "today") return { from: endDate, to: endDate };
  const date = new Date(`${endDate}T12:00:00Z`);
  if (preset === "month") date.setUTCDate(1);
  else date.setUTCDate(date.getUTCDate() - (preset === "30d" ? 29 : 6));
  return { from: date.toISOString().slice(0, 10), to: endDate };
};
const money = (amount: number | string | undefined, currency = "NGN") => {
  if (amount === undefined || !Number.isFinite(Number(amount))) return "-";
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
};
const displayDate = (value: string) => {
  if (!value) return "â€”";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (!Number.isFinite(parsed.getTime())) return "â€”";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
  }).format(parsed);
};
const displayDateTime = (value: string) => {
  if (!value) return "â€”";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "â€”";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(parsed);
};

function LoginLink({ staff = false }: { staff?: boolean }) {
  return (
    <Link
      className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
      href={staff ? "/staff/login" : "/oceanicadminlogin"}
    >
      Sign in
    </Link>
  );
}

export default function HomePage() {
  const pathname = usePathname();
  const isStaffWorkspace = pathname.startsWith("/staff");
  const currentUserQuery = useCurrentUser();
  const user = (currentUserQuery.data?.user as User | undefined) ?? null;
  const branchesQuery = useBranches<Branch>(Boolean(user));
  const authLoading = currentUserQuery.isPending;
  const authError = currentUserQuery.error instanceof Error
    ? currentUserQuery.error.message
    : "";
  const markNotificationReadMutation = useMarkNotificationRead();
  const [preset, setPreset] = useState("7d");
  const [range, setRange] = useState({ from: "", to: "" });
  const [timezone, setTimezone] = useState<string>();
  const branchId = useBranchStore((state) => state.selectedBranchId);
  const setBranchId = useBranchStore((state) => state.setSelectedBranchId);
  const initializeBranchSelection = useBranchStore((state) => state.initializeBranchSelection);
  const branchSelectionInitialized = useBranchStore((state) => state.branchSelectionInitialized);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [greeting, setGreeting] = useState("day");

  useEffect(() => {
    if (!user) return;
    const date = new Date();
    setGreeting(
      date.getHours() < 12
        ? "morning"
        : date.getHours() < 17
          ? "afternoon"
          : "evening",
    );
    setRange((current) => current.from ? current : rangeFor("7d"));
  }, [user]);
  const days = range.from && range.to
    ? Math.max(1, Math.round((new Date(`${range.to}T12:00:00`).getTime() - new Date(`${range.from}T12:00:00`).getTime()) / 86_400_000) + 1)
    : 7;
  const previousTo = range.from ? addCalendarDays(range.from, -1) : "";
  const previousFrom = previousTo ? addCalendarDays(previousTo, -days + 1) : "";
  const today = dateInTimezone(new Date(), timezone);
  const branches = branchesQuery.data?.data ?? [];
  const branchListReady = branchesQuery.isSuccess;

  useEffect(() => {
    if (!branchListReady || branchSelectionInitialized) return;
    const mainBranch = branches.find((branch) => branch.isDefault) ?? branches[0];
    initializeBranchSelection(mainBranch?.id ?? "");
  }, [branchListReady, branchSelectionInitialized, branches, initializeBranchSelection]);

  const dashboardQuery = useDashboardOverview<HomeData>({
    role: user?.role ?? "",
    branchId,
    from: range.from,
    to: range.to,
    today,
    previousFrom,
    previousTo,
    timezone,
    enabled: branchListReady && (Boolean(branchId) || branches.length === 0 || branchSelectionInitialized),
  });
  const dashboard: HomeData = {
    ...dashboardQuery.data,
    branches: branchesQuery.isError
      ? { error: "Branch list could not be loaded." }
      : branchesQuery.data
        ? { data: branchesQuery.data }
        : undefined,
  };
  const loading = dashboardQuery.isFetching || branchesQuery.isFetching;
  const refresh = useCallback(async () => {
    await dashboardQuery.refetch();
  }, [dashboardQuery.refetch]);

  useEffect(() => {
    const businessTimezone = dashboard.business?.data?.data.timezone;
    if (!businessTimezone || businessTimezone === timezone) return;
    setTimezone(businessTimezone);
    if (preset !== "custom") setRange(rangeFor(preset, businessTimezone));
  }, [dashboard.business?.data?.data.timezone, preset, timezone]);

  const business = dashboard.business?.data?.data;
  const currency = business?.currency ?? "NGN";
  const report = dashboard.period?.data?.data;
  const previous = dashboard.previous?.data?.data;
  const todayReport = dashboard.today?.data?.data;
  const inventoryRows = dashboard.inventory?.data?.data;
  const lowStock = dashboard.inventory?.data?.summary.lowStockCount;
  const outOfStock = dashboard.inventory?.data?.summary.outOfStockCount;
  const healthyStock = Math.max(
    0,
    (dashboard.inventory?.data?.summary.balanceCount ?? 0) -
      (lowStock ?? 0) -
      (outOfStock ?? 0),
  );
  const expiringLots = dashboard.inventory?.data?.summary.expiringWithin30Days;
  const pendingStatuses = [
    "PAID",
    "PROCESSING",
    "READY_FOR_COLLECTION",
    "DISPATCHED",
    "PARTIALLY_FULFILLED",
  ];
  const pendingOrders = dashboard.orders?.data?.data.filter((order) =>
    pendingStatuses.includes(order.status),
  );
  const pendingOrderCount = dashboard.orders?.data?.counts
    ? pendingStatuses.reduce(
        (sum, status) => sum + (dashboard.orders?.data?.counts?.[status] ?? 0),
        0,
      )
    : pendingOrders?.length;
  const overdueReceivables = dashboard.receivables?.data
    ? Object.entries(dashboard.receivables.data.buckets)
        .filter(([key]) => key !== "current")
        .reduce((sum, [, value]) => sum + Number(value), 0)
    : undefined;
  const dateLabel =
    range.from === range.to ? range.from : `${range.from} to ${range.to}`;
  const currentPeriodSales = report?.netSales;
  const previousSales = previous?.netSales;
  const salesChange =
    currentPeriodSales !== undefined &&
    previousSales !== undefined &&
    previousSales !== 0
      ? ((currentPeriodSales - previousSales) / Math.abs(previousSales)) * 100
      : undefined;

  const activity = useMemo(() => {
    const entries: {
      key: string;
      at: string;
      reference: string;
      action: string;
      actor: string;
      area: string;
      status: string;
      amount?: string;
    }[] = [];
    for (const sale of dashboard.sales?.data?.data ?? [])
      entries.push({
        key: `sale-${sale.id}`,
        at: sale.createdAt,
        reference: sale.number,
        action: "Sale recorded",
        actor: sale.user?.name ?? "Staff member",
        area: sale.channel === "ONLINE" ? "Online store" : "Point of sale",
        status: sale.status,
        amount: money(Number(sale.total), currency),
      });
    for (const item of dashboard.movements?.data?.data ?? [])
      entries.push({
        key: `movement-${item.id}`,
        at: item.createdAt,
        reference: item.product.sku,
        action: item.type.replaceAll("_", " ").toLowerCase(),
        actor: item.user?.name ?? "Staff member",
        area: item.branch.name,
        status: "Posted",
        amount: `${Number(item.quantity) > 0 ? "+" : ""}${Number(item.quantity)} units`,
      });
    for (const purchase of dashboard.purchases?.data?.data ?? [])
      entries.push({
        key: `purchase-${purchase.id}`,
        at: purchase.createdAt,
        reference: purchase.number,
        action: "Supplier order",
        actor: purchase.supplier.name,
        area: purchase.branch.name,
        status: purchase.status,
      });
    for (const receipt of dashboard.receipts?.data?.data ?? [])
      entries.push({
        key: `receipt-${receipt.receipt}-${receipt.sku}`,
        at: receipt.date,
        reference: receipt.receipt,
        action: `Stock received | ${receipt.product}`,
        actor: receipt.supplier,
        area: branchId
          ? (dashboard.branches?.data?.data.find(
              (branch) => branch.id === branchId,
            )?.name ?? "Selected branch")
          : "Business",
        status: "Received",
        amount: `${receipt.quantity} units`,
      });
    for (const order of dashboard.orders?.data?.data ?? [])
      entries.push({
        key: `order-${order.id}`,
        at: order.createdAt,
        reference: order.number,
        action: "Online order",
        actor: "Online customer",
        area: "Online store",
        status: order.status,
        amount: money(Number(order.total), currency),
      });
    return entries
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8);
  }, [
    dashboard.sales,
    dashboard.movements,
    dashboard.purchases,
    dashboard.receipts,
    dashboard.orders,
    dashboard.branches,
    branchId,
    currency,
  ]);

  function changePreset(nextPreset: string) {
    setPreset(nextPreset);
    if (nextPreset !== "custom")
      setRange(rangeFor(nextPreset, business?.timezone));
  }

  async function exportReport() {
    if (!canSeeFinance(user?.role ?? "STAFF")) return;
    try {
      const { blob, filename } = await downloadWeeklyPerformance({
        from: range.from,
        to: range.to,
        branchId,
        format: "xlsx",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || `weekly-performance-${range.from}-${range.to}.xlsx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setActionMessage(
        "The report export failed. Check your session and try again.",
      );
    }
  }

  async function markRead(notificationId: string) {
    try {
      await markNotificationReadMutation.mutateAsync(notificationId);
    } catch (error) {
      setActionMessage(
        error instanceof Error
          ? error.message
          : "Notification could not be updated.",
      );
    }
  }

  if (authLoading)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-2.5 text-[#718077] text-sm">
        <span className="h-[35px] w-[35px] rounded-[10px] bg-brand text-white grid [place-items:center] font-normal">
          O
        </span>
        <span>Connecting to your workspace...</span>
      </div>
    );
  if (authError && !user)
    return (
      <main className="min-h-screen grid [align-content:center] [justify-items:center] gap-3 text-center p-6 [&_h1]:text-[22px] [&_h1]:m-0 [&_p]:text-sm [&_p]:text-[#75827a]">
        <h1>Workspace unavailable</h1>
        <p>{authError}</p>
        <LoginLink staff={isStaffWorkspace} />
      </main>
    );
  if (!user) return null;

  const displayBusiness = business?.name ?? "Your business";
  const unreadCount = dashboard.notifications?.data?.unreadCount ?? 0;

  return (
    <div className="min-h-screen">
      <main className="min-h-screen" id="overview">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <DashboardPageHeading
            greeting={greeting}
            userName={user.name}
            businessName={displayBusiness}
            loading={loading}
            onRefresh={() => void refresh()}
            canExport={canSeeFinance(user.role)}
            onExport={() => void exportReport()}
            workspaceLabel={isStaffWorkspace ? "STAFF WORKSPACE" : "BUSINESS OVERVIEW"}
          />

          <DashboardFilters
            businessName={displayBusiness}
            timezone={business?.timezone}
            branches={dashboard.branches?.data?.data ?? []}
            branchId={branchId}
            onBranchChange={setBranchId}
            preset={preset}
            onPresetChange={changePreset}
            range={range}
            onRangeChange={setRange}
          />

          {actionMessage && (
            <div
              className="fixed [right:22px] [bottom:20px] z-[80] bg-[#203a2d] text-white py-[11px] px-[13px] rounded-lg shadow-[0_10px_28px_#16241c2e] flex items-center gap-3 text-sm [max-width:min(480px,calc(100vw_-_32px))] [&_button]:[border:0] [&_button]:bg-transparent [&_button]:text-[#d4ded7] [&_button]:grid [&_button]:[place-items:center] [&_button]:p-0.5"
              role="status"
            >
              <span>{actionMessage}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => setActionMessage("")}
              >
                <DashboardIcon name="close" size={14} />
              </button>
            </div>
          )}
          {(dashboard.branches?.error ||
            dashboard.sales?.error ||
            dashboard.inventory?.error) && (
            <div
              className="flex items-center gap-2 border border-[#f0dfb7] bg-[#fff9eb] text-[#86692d] rounded-lg py-[9px] px-3 mt-0 mx-0 mb-[13px] text-sm [&_svg]:text-[#c29239]"
              role="status"
            >
              <DashboardIcon name="alert" size={17} />
              <span>
                Some dashboard sections could not load. Data that failed is
                marked below instead of being shown as zero.
              </span>
            </div>
          )}

          <section className="mt-[3px] mx-0 mb-4" aria-label="Quick actions">
            <div className="flex items-center justify-between mb-2 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_p]:text-sm [&_p]:text-[#89958e] [&_p]:mt-[3px] mx-0 mb-0">
              <div>
                <h2>Quick links</h2>
                <p>Open common store workspaces.</p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2 max-[1200px]:grid-cols-3 max-[620px]:grid-cols-2">
              {canManageInventory(user.role) && (
                <Link className="flex min-h-[58px] min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left text-ink transition hover:-translate-y-px hover:border-[#bfd4c4] max-[620px]:min-h-[57px] max-[620px]:p-2" href="/admin/products/new">
                  <span className="grid size-[29px] shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-[#438060]">
                    <DashboardIcon name="plus" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">Add product</strong>
                    <small className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#929d96]">Expand your catalogue</small>
                  </span>
                  <span className="text-[#9aa59e]"><DashboardIcon name="chevron" size={15} /></span>
                </Link>
              )}
              {canManageInventory(user.role) && (
                <Link className="flex min-h-[58px] min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left text-ink transition hover:-translate-y-px hover:border-[#bfd4c4] max-[620px]:min-h-[57px] max-[620px]:p-2" href="/admin/purchasing">
                  <span className="grid size-[29px] shrink-0 place-items-center rounded-lg bg-[#fff5e6] text-[#b7832b]">
                    <DashboardIcon name="cart" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">Purchasing</strong>
                    <small className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#929d96]">Review stock orders</small>
                  </span>
                  <span className="text-[#9aa59e]"><DashboardIcon name="chevron" size={15} /></span>
                </Link>
              )}
              {canUsePos(user.role) && (
                <Link className="flex min-h-[58px] min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left text-ink transition hover:-translate-y-px hover:border-[#bfd4c4] max-[620px]:min-h-[57px] max-[620px]:p-2" href="/admin/sales">
                  <span className="grid size-[29px] shrink-0 place-items-center rounded-lg bg-[#f2eff9] text-[#7767a8]">
                    <DashboardIcon name="scan" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">Sales overview</strong>
                    <small className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#929d96]">Review sales performance</small>
                  </span>
                  <span className="text-[#9aa59e]"><DashboardIcon name="chevron" size={15} /></span>
                </Link>
              )}
              {canSeeCustomers(user.role) && (
                <Link className="flex min-h-[58px] min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left text-ink transition hover:-translate-y-px hover:border-[#bfd4c4] max-[620px]:min-h-[57px] max-[620px]:p-2" href="/admin/customers">
                  <span className="grid size-[29px] shrink-0 place-items-center rounded-lg bg-[#fff0ec] text-[#bb705d]">
                    <DashboardIcon name="wallet" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">Customers</strong>
                    <small className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#929d96]">Review balances and statements</small>
                  </span>
                  <span className="text-[#9aa59e]"><DashboardIcon name="chevron" size={15} /></span>
                </Link>
              )}
              {canSeeOrders(user.role) && (
                <Link className="flex min-h-[58px] min-w-0 items-center gap-2 rounded-lg border border-line bg-white px-2.5 py-2 text-left text-ink transition hover:-translate-y-px hover:border-[#bfd4c4] max-[620px]:min-h-[57px] max-[620px]:p-2" href="/admin/orders">
                  <span className="grid size-[29px] shrink-0 place-items-center rounded-lg bg-[#edf4f9] text-[#4d7c9c]">
                    <DashboardIcon name="receipt" />
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <strong className="overflow-hidden text-ellipsis whitespace-nowrap text-sm font-normal">Website orders</strong>
                    <small className="overflow-hidden text-ellipsis whitespace-nowrap text-sm text-[#929d96]">Review fulfillment queue</small>
                  </span>
                  <span className="text-[#9aa59e]"><DashboardIcon name="chevron" size={15} /></span>
                </Link>
              )}
            </div>
          </section>

          <section
            className="grid grid-cols-4 gap-3 mb-3 max-[900px]:grid-cols-2 max-[620px]:gap-2"
            aria-label="Business performance metrics"
          >
            <DashboardMetricCard
              label="Net sales"
              value={money(report?.netSales, currency)}
              detail={`${dateLabel} | after discounts and returns${salesChange === undefined ? "" : ` | ${salesChange >= 0 ? "+" : ""}${salesChange.toFixed(1)}% vs prior period`}`}
              icon="chart"
              tone="green"
              error={
                !canSeeFinance(user.role)
                  ? "This role cannot access business financial reports."
                  : dashboard.period?.error
              }
              href="#sales-performance"
            />
            <DashboardMetricCard
              label="Gross profit"
              value={money(report?.grossProfit, currency)}
              detail={
                report
                  ? `${(report.grossMargin * 100).toFixed(1)}% gross margin | net sales less COGS`
                  : `${dateLabel} | report based`
              }
              icon="arrow"
              tone="blue"
              error={
                !canSeeFinance(user.role)
                  ? "This role cannot access business financial reports."
                  : dashboard.period?.error
              }
              href="#sales-performance"
            />
            <DashboardMetricCard
              label="Money customers owe"
              value={money(
                dashboard.receivables?.data?.totalOutstanding,
                currency,
              )}
              detail={
                overdueReceivables === undefined
                  ? "Outstanding customer balances"
                  : `${money(overdueReceivables, currency)} overdue`
              }
              icon="users"
              tone="amber"
              error={
                !canSeeFinance(user.role)
                  ? "This role cannot access business financial reports."
                  : dashboard.receivables?.error
              }
              href="#financial-health"
            />
            <DashboardMetricCard
              label="Value of stock"
              value={money(
                dashboard.inventory?.data?.summary.inventoryValue,
                currency,
              )}
              detail={`At current valuation cost | ${branchId ? "selected branch" : "all branches"}`}
              icon="package"
              tone="violet"
              error={
                dashboard.inventory?.error ||
                (dashboard.inventory?.data &&
                dashboard.inventory.data.summary.inventoryValue === undefined
                  ? "Your role cannot access inventory cost."
                  : undefined)
              }
              href="#stock-health"
            />
          </section>

          <section
            className="grid grid-cols-4 gap-2 [margin-bottom:14px] max-[900px]:grid-cols-2 max-[620px]:gap-2"
            aria-label="Additional operational metrics"
          >
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px]">
                <DashboardIcon name="wallet" size={16} />
              </span>
              <div>
                <small>Payments received today</small>
                <strong>
                  {!canSeeFinance(user.role)
                    ? "Restricted"
                    : dashboard.today?.error
                      ? "Unavailable"
                      : money(todayReport?.cashCollected, currency)}
                </strong>
                <span>Successful customer allocations | all methods</span>
              </div>
              <a href="#financial-health" aria-label="View financial health">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.today?.error
                }
              />
            </article>
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px] amber">
                <DashboardIcon name="layers" size={16} />
              </span>
              <div>
                <small>Low / out of stock</small>
                <strong>
                  {dashboard.inventory?.error
                    ? "Unavailable"
                    : `${lowStock ?? "-"} / ${outOfStock ?? "-"}`}
                </strong>
                <span>Available quantity vs reorder level</span>
              </div>
              <a href="#stock-health" aria-label="View stock health">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError message={dashboard.inventory?.error} />
            </article>
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px] blue">
                <DashboardIcon name="cart" size={16} />
              </span>
              <div>
                <small>Supplier payables</small>
                <strong>
                  {!canSeeFinance(user.role)
                    ? "Restricted"
                    : dashboard.payables?.error
                      ? "Unavailable"
                      : money(
                          dashboard.payables?.data?.totalOutstanding,
                          currency,
                        )}
                </strong>
                <span>Outstanding supplier invoices</span>
              </div>
              <a href="#financial-health" aria-label="View supplier payables">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.payables?.error
                }
              />
            </article>
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px] rose">
                <DashboardIcon name="receipt" size={16} />
              </span>
              <div>
                <small>Orders needing action</small>
                <strong>
                  {dashboard.orders?.error
                    ? "Unavailable"
                    : (pendingOrderCount ?? "-")}
                </strong>
                <span>Paid or processing online orders</span>
              </div>
              <a href="#recent-activity" aria-label="View order activity">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError message={dashboard.orders?.error} />
            </article>
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px] blue">
                <DashboardIcon name="chart" size={16} />
              </span>
              <div>
                <small>Net profit</small>
                <strong>
                  {!canSeeFinance(user.role)
                    ? "Restricted"
                    : dashboard.period?.error
                      ? "Unavailable"
                      : money(report?.netProfit, currency)}
                </strong>
                <span>{dateLabel} | after expenses and gateway fees</span>
              </div>
              <a href="#sales-performance" aria-label="View net profit">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.period?.error
                }
              />
            </article>
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px] amber">
                <DashboardIcon name="wallet" size={16} />
              </span>
              <div>
                <small>Operating expenses</small>
                <strong>
                  {!canSeeFinance(user.role)
                    ? "Restricted"
                    : dashboard.period?.error
                      ? "Unavailable"
                      : money(report?.operatingExpenses, currency)}
                </strong>
                <span>{dateLabel} | expenses by incurred date</span>
              </div>
              <a href="#financial-health" aria-label="View operating expenses">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.period?.error
                }
              />
            </article>
            <article className="min-w-0 relative flex gap-2 items-stretch border border-line bg-white rounded-lg p-3 [&>div]:grid [&>div]:grid-rows-[auto_auto_1fr] [&>div]:gap-[3px] [&>div]:min-w-0 [&_small]:text-sm [&_small]:text-[#79867e] [&_strong]:text-sm [&_strong]:font-normal [&_strong]:tracking-[-.3px] [&>div>span]:text-[12px] [&>div>span]:self-end [&>div>span]:text-[#9aa49e] [&>div>span]:leading-[1.35] [&>a]:[margin-left:auto] [&>a]:text-[#98a49c] [&>a]:[padding-top:2px] [&_.data-error]:[grid-column:1/-1] [&:has(.data-error:not(:empty))]:flex-wrap max-[620px]:p-2 max-[620px]:gap-1.5 max-[620px]:[&_strong]:text-sm max-[620px]:[&_small]:text-sm">
              <span className="h-[27px] w-[27px] rounded-lg bg-[#edf5ef] text-[#478264] grid [place-items:center] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] max-[620px]:h-[24px] max-[620px]:w-[24px] green">
                <DashboardIcon name="chart" size={16} />
              </span>
              <div>
                <small>Sales today</small>
                <strong>
                  {!canSeeFinance(user.role)
                    ? "Restricted"
                    : dashboard.today?.error
                      ? "Unavailable"
                      : money(todayReport?.netSales, currency)}
                </strong>
                <span>Net sales after returns | today</span>
              </div>
              <a href="#sales-performance" aria-label="View today's sales">
                <DashboardIcon name="arrow" size={14} />
              </a>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.today?.error
                }
              />
            </article>
          </section>

          <section
            className="grid [grid-template-columns:minmax(0,1.8fr)_minmax(270px,1fr)] gap-3 mb-3 max-[1200px]:[grid-template-columns:minmax(0,1.5fr)_minmax(250px,1fr)] max-[900px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[620px]:[grid-template-columns:minmax(0,1fr)] max-[620px]:gap-2"
            id="sales-performance"
          >
            <article className="sales-panel min-w-0 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm max-[620px]:p-4">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Sales Report</h2>
                  <p>{dateLabel} | backend report by business timezone</p>
                </div>
                <div className="flex items-center gap-3 text-[#78857d] text-sm [&_span]:flex [&_span]:items-center [&_span]:gap-1 [&_span]:whitespace-nowrap [&_i]:w-[8px] [&_i]:h-[8px] [&_i]:rounded-full [&_i]:bg-[#327e60] [&_.legend-profit]:bg-[#9bbba4] max-[620px]:gap-2">
                  <span>
                    <i className="legend-sales" /> Net sales
                  </span>
                  <span>
                    <i className="legend-profit" /> Gross profit
                  </span>
                </div>
              </div>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.period?.error
                }
              />
              <DashboardSalesChart
                report={canSeeFinance(user.role) ? report : undefined}
                previousReport={canSeeFinance(user.role) ? previous : undefined}
                previousRange={{ from: previousFrom, to: previousTo }}
                currency={currency}
                range={range}
                formatMoney={money}
                formatDate={displayDate}
              />
              {canSeeFinance(user.role) && report && (
                <div className="[border-top:1px_solid_#eff2ef] [margin-top:8px] [padding-top:10px] grid [grid-template-columns:repeat(3,1fr)] gap-2.5 [&>span]:text-sm [&>span]:text-[#87938b] [&>span]:grid [&>span]:gap-1 [&_strong]:text-sm [&_strong]:text-[#2b3b32] [&_strong]:font-normal [&_small]:text-sm [&_small]:text-[#a1aaa4] max-[620px]:gap-1 max-[620px]:[&_strong]:text-sm">
                  <span>
                    Net sales{" "}
                    <strong>{money(report.netSales, currency)}</strong>
                  </span>
                  <span>
                    Gross profit{" "}
                    <strong>{money(report.grossProfit, currency)}</strong>
                  </span>
                  <span>
                    Payments received{" "}
                    <strong>{money(report.cashCollected, currency)}</strong>
                    <small>Tracked separately from sales</small>
                  </span>
                </div>
              )}
            </article>
            <article className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Sales by where customers buy</h2>
                  <p>Completed sales | {dateLabel}</p>
                </div>
                <span className="text-sm leading-[9px] text-[#a5aea8] tracking-wide">
                  ...
                </span>
              </div>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.period?.error
                }
              />
              {canSeeFinance(user.role) && report ? (
                <>
                  <div className="text-xl font-normal tracking-[-.5px] mt-[18px] mx-0 mb-1 [&_small]:text-sm [&_small]:text-[#88958d] [&_small]:font-normal [&_small]:[margin-left:6px] [&_small]:tracking-[0]">
                    {money(report.netSales, currency)}
                    <small>net sales</small>
                  </div>
                  <div className="h-[8px] flex overflow-hidden rounded-lg bg-[#f1f4f1] mt-3 mx-0 mb-4">
                    {report.byChannel.length ? report.byChannel.map((channel, index) => (
                        <span
                          key={channel.channel}
                          className={`h-full bg-[#2f7959] [&.channel-1]:bg-[#74a78a] [&.channel-2]:bg-[#c5d7c9] channel-${index % 3}`}
                          style={{
                            width: `${report.netSales > 0 ? Math.max(0, (channel.amount / report.netSales) * 100) : 0}%`,
                          }}
                        />
                      )) : (
                        <span className="h-full w-full bg-[#e8ece9]" aria-label="No sales by channel yet" />
                      )}
                  </div>
                  <div className="grid gap-3">
                    {report.byChannel.length ? report.byChannel.map((channel, index) => (
                      <div
                        className="grid [grid-template-columns:8px_minmax(0,1fr)_auto_32px] items-center gap-2 text-sm text-[#65736a] [&_strong]:text-[#3a4a40] [&_strong]:font-normal [&_small]:text-right [&_small]:text-[#96a199]"
                        key={channel.channel}
                      >
                        <span
                          className={`w-[7px] h-[7px] rounded-full bg-[#2f7959] [&.channel-1]:bg-[#74a78a] [&.channel-2]:bg-[#c5d7c9] channel-${index % 3}`}
                        />
                        <span>{channel.channel.replaceAll("_", " ")}</span>
                        <strong>{money(channel.amount, currency)}</strong>
                        <small>
                          {report.netSales > 0
                            ? `${Math.round((channel.amount / report.netSales) * 100)}%`
                            : "0%"}
                        </small>
                      </div>
                    )) : <p className="m-0 text-sm text-muted">No completed sales by channel for this period yet.</p>}
                  </div>
                </>
              ) : (
                canSeeFinance(user.role) && (
                  <div className="h-[185px] grid [place-items:center] text-[#8e9a92] text-sm text-center p-5">
                    Channel data is loading.
                  </div>
                )
              )}
            </article>
          </section>

          <section className="grid [grid-template-columns:minmax(0,1.8fr)_minmax(270px,1fr)] gap-3 mb-3 max-[1200px]:[grid-template-columns:minmax(0,1.5fr)_minmax(250px,1fr)] max-[900px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[620px]:[grid-template-columns:minmax(0,1fr)] max-[620px]:gap-2 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[620px]:[grid-template-columns:minmax(0,1fr)] max-[620px]:gap-2">
            <article
              className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 stock-panel"
              id="stock-health"
            >
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Stock levels</h2>
                  <p>
                    {branchId
                      ? "Available quantities in the selected branch"
                      : "Available quantities across all branches"}
                  </p>
                </div>
                <a
                  className="flex items-center gap-1 text-[#38765a] text-sm font-normal [&:hover]:[text-decoration:underline]"
                  href="#recent-activity"
                >
                  Recent movements <DashboardIcon name="arrow" size={13} />
                </a>
              </div>
              <DashboardDataError message={dashboard.inventory?.error} />
              {inventoryRows ? (
                <>
                  <div className="text-[21px] font-normal tracking-[-.5px] mt-1 mx-0 mb-3 [&_span]:text-sm [&_span]:text-[#8b978f] [&_span]:font-normal [&_span]:tracking-[0] [&_span]:[margin-left:7px]">
                    {dashboard.inventory?.data?.summary.productCount.toLocaleString()}
                    <span>
                      products |{" "}
                      {dashboard.inventory?.data?.summary.balanceCount.toLocaleString()}{" "}
                      branch balances
                    </span>
                  </div>
                  <div className="grid gap-3 [&>div]:grid [&>div]:[grid-template-columns:1fr_auto] [&>div]:gap-[5px 12px] [&>div]:items-center [&_strong]:text-sm [&_strong]:font-normal">
                    <div>
                      <span className="flex items-center gap-1.5 text-[#6e7a72] text-sm [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:inline-block [&_i]:bg-[#55a17b] [&_i.stock-low]:bg-[#dfa644] [&_i.stock-empty]:bg-[#d67b69]">
                        <i className="stock-good" />
                        Healthy stock
                      </span>
                      <strong>{healthyStock}</strong>
                      <div className="[&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:inline-block [&_i]:bg-[#55a17b] [&_i.stock-low]:bg-[#dfa644] [&_i.stock-empty]:bg-[#d67b69] [grid-column:1/-1] h-[5px] rounded-md bg-[#f0f3f0] overflow-hidden [&_i]:h-full [&_i]:block [&_i]:rounded-md [&_i]:[max-width:100%]">
                        <i
                          className="stock-good"
                          style={{
                            width: `${dashboard.inventory?.data?.summary.balanceCount ? ((healthyStock ?? 0) / dashboard.inventory.data.summary.balanceCount) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <span className="flex items-center gap-1.5 text-[#6e7a72] text-sm [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:inline-block [&_i]:bg-[#55a17b] [&_i.stock-low]:bg-[#dfa644] [&_i.stock-empty]:bg-[#d67b69]">
                        <i className="stock-low" />
                        Low stock
                      </span>
                      <strong>{lowStock}</strong>
                      <div className="[&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:inline-block [&_i]:bg-[#55a17b] [&_i.stock-low]:bg-[#dfa644] [&_i.stock-empty]:bg-[#d67b69] [grid-column:1/-1] h-[5px] rounded-md bg-[#f0f3f0] overflow-hidden [&_i]:h-full [&_i]:block [&_i]:rounded-md [&_i]:[max-width:100%]">
                        <i
                          className="stock-low"
                          style={{
                            width: `${dashboard.inventory?.data?.summary.balanceCount ? ((lowStock ?? 0) / dashboard.inventory.data.summary.balanceCount) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <span className="flex items-center gap-1.5 text-[#6e7a72] text-sm [&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:inline-block [&_i]:bg-[#55a17b] [&_i.stock-low]:bg-[#dfa644] [&_i.stock-empty]:bg-[#d67b69]">
                        <i className="stock-empty" />
                        Out of stock
                      </span>
                      <strong>{outOfStock}</strong>
                      <div className="[&_i]:w-[7px] [&_i]:h-[7px] [&_i]:rounded-full [&_i]:inline-block [&_i]:bg-[#55a17b] [&_i.stock-low]:bg-[#dfa644] [&_i.stock-empty]:bg-[#d67b69] [grid-column:1/-1] h-[5px] rounded-md bg-[#f0f3f0] overflow-hidden [&_i]:h-full [&_i]:block [&_i]:rounded-md [&_i]:[max-width:100%]">
                        <i
                          className="stock-empty"
                          style={{
                            width: `${dashboard.inventory?.data?.summary.balanceCount ? ((outOfStock ?? 0) / dashboard.inventory.data.summary.balanceCount) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 [padding-top:11px] [margin-top:11px] [border-top:1px_solid_#eff2ef] text-[#8c9890] text-sm leading-[1.45] [&_svg]:text-[#c18d3b]">
                    <DashboardIcon name="alert" size={15} />
                    <span>
                      Counts are based on available stock (on hand less
                      reservations) against each product&apos;s reorder level.
                    </span>
                  </div>
                </>
              ) : (
                <div className="h-[185px] grid [place-items:center] text-[#8e9a92] text-sm text-center p-5">
                  Stock health is unavailable until inventory data loads.
                </div>
              )}
            </article>
            <article
              className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 [&>.panel-heading>svg]:text-[#7f8f84]"
              id="financial-health"
            >
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Money to check</h2>
                  <p>Balances and reconciliations</p>
                </div>
                <DashboardIcon name="wallet" size={17} />
              </div>
              <DashboardDataError
                message={
                  !canSeeFinance(user.role)
                    ? "Financial report access is restricted for this role."
                    : dashboard.receivables?.error ||
                      dashboard.payables?.error ||
                      dashboard.reconciliation?.error
                }
              />
              <div className="grid">
                <div className="flex items-center gap-2 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:[flex:1] [&_strong]:text-sm [&_strong]:font-normal [&_small]:text-sm [&_small]:text-[#929e96] [&>b]:text-sm [&>b]:font-normal [&>b]:whitespace-nowrap">
                  <span className="h-[27px] w-[27px] rounded-lg grid [place-items:center] bg-[#edf5ef] text-[#488466] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] amber">
                    <DashboardIcon name="users" size={16} />
                  </span>
                  <span>
                    <strong>Overdue receivables</strong>
                    <small>Past due customer balances</small>
                  </span>
                  <b>
                    {!canSeeFinance(user.role)
                      ? "Restricted"
                      : dashboard.receivables?.error
                        ? "Unavailable"
                        : money(overdueReceivables, currency)}
                  </b>
                </div>
                <div className="flex items-center gap-2 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:[flex:1] [&_strong]:text-sm [&_strong]:font-normal [&_small]:text-sm [&_small]:text-[#929e96] [&>b]:text-sm [&>b]:font-normal [&>b]:whitespace-nowrap">
                  <span className="h-[27px] w-[27px] rounded-lg grid [place-items:center] bg-[#edf5ef] text-[#488466] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] blue">
                    <DashboardIcon name="cart" size={16} />
                  </span>
                  <span>
                    <strong>Supplier payables</strong>
                    <small>Outstanding invoice balances</small>
                  </span>
                  <b>
                    {!canSeeFinance(user.role)
                      ? "Restricted"
                      : dashboard.payables?.error
                        ? "Unavailable"
                        : money(
                            dashboard.payables?.data?.totalOutstanding,
                            currency,
                          )}
                  </b>
                </div>
                <div className="flex items-center gap-2 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:[flex:1] [&_strong]:text-sm [&_strong]:font-normal [&_small]:text-sm [&_small]:text-[#929e96] [&>b]:text-sm [&>b]:font-normal [&>b]:whitespace-nowrap">
                  <span className="h-[27px] w-[27px] rounded-lg grid [place-items:center] bg-[#edf5ef] text-[#488466] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] rose">
                    <DashboardIcon name="alert" size={16} />
                  </span>
                  <span>
                    <strong>Unsettled gateway payments</strong>
                    <small>
                      Successful Paystack payments without settlement | all time
                    </small>
                  </span>
                  <b>
                    {!canSeeFinance(user.role)
                      ? "Restricted"
                      : dashboard.reconciliation?.error
                        ? "Unavailable"
                        : money(
                            dashboard.reconciliation?.data?.summary
                              .unsettledGatewayAmount,
                            currency,
                          )}
                  </b>
                </div>
                <div className="flex items-center gap-2 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:[flex:1] [&_strong]:text-sm [&_strong]:font-normal [&_small]:text-sm [&_small]:text-[#929e96] [&>b]:text-sm [&>b]:font-normal [&>b]:whitespace-nowrap">
                  <span className="h-[27px] w-[27px] rounded-lg grid [place-items:center] bg-[#edf5ef] text-[#488466] [flex:none] [&.amber]:bg-[#fff5e6] [&.amber]:text-[#b7832b] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] [&.rose]:bg-[#fff0ec] [&.rose]:text-[#bb705d] green">
                    <DashboardIcon name="scan" size={16} />
                  </span>
                  <span>
                    <strong>Cash shift variance</strong>
                    <small>Closed shifts | {dateLabel}</small>
                  </span>
                  <b
                    className={
                      (dashboard.reconciliation?.data?.summary.totalVariance ??
                        0) < 0
                        ? "text-[#c45c50]"
                        : ""
                    }
                  >
                    {!canSeeFinance(user.role)
                      ? "Restricted"
                      : dashboard.reconciliation?.error
                        ? "Unavailable"
                        : money(
                            dashboard.reconciliation?.data?.summary
                              .totalVariance,
                            currency,
                          )}
                  </b>
                </div>
              </div>
            </article>
          </section>

          <section
            className="grid [grid-template-columns:minmax(0,1.8fr)_minmax(270px,1fr)] gap-3 mb-3 max-[1200px]:[grid-template-columns:minmax(0,1.5fr)_minmax(250px,1fr)] max-[900px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[620px]:[grid-template-columns:minmax(0,1fr)] max-[620px]:gap-2 [grid-template-columns:minmax(0,1.75fr)_minmax(260px,1fr)] max-[1200px]:[grid-template-columns:minmax(0,1.45fr)_minmax(240px,1fr)] max-[900px]:[grid-template-columns:minmax(0,1fr)_minmax(0,1fr)] max-[620px]:[grid-template-columns:minmax(0,1fr)] max-[620px]:gap-2"
            id="recent-activity"
          >
            <article className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 max-[900px]:[grid-column:1/-1] max-[620px]:[grid-column:auto]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Recent activity</h2>
                  <p>Sales, stock movements and purchase orders</p>
                </div>
                <button
                  className="h-[27px] border border-[#e3e9e3] rounded-md bg-white text-[#64736a] flex items-center gap-1 py-0 px-2 text-sm [&:hover]:bg-[#f6f9f6]"
                  onClick={() => void refresh()}
                >
                  <DashboardIcon name="refresh" size={14} /> Refresh
                </button>
              </div>
              <DashboardDataError
                message={
                  dashboard.sales?.error ||
                  dashboard.movements?.error ||
                  dashboard.purchases?.error
                }
              />
              <div className="[overflow-x:auto]">
                <table className="w-full [border-collapse:collapse] [min-width:650px] text-left [&_th]:text-sm [&_th]:tracking-[.55px] [&_th]:text-[#929e96] [&_th]:font-normal [&_th]:py-2 px-[7px] [&_th]:[border-bottom:1px_solid_#e9eeea] [&_th]:whitespace-nowrap [&_td]:text-sm [&_td]:text-[#748078] [&_td]:py-[9px] px-[7px] [&_td]:[border-bottom:1px_solid_#f0f3f0] [&_td]:whitespace-nowrap [&_tr:last-child_td]:[border-bottom:0] [&_td_strong]:text-sm [&_td_strong]:text-[#435249] [&_td_strong]:font-normal [&_.activity-name]:[text-transform:capitalize] [&_.activity-name]:text-[#47564d]">
                  <thead>
                    <tr>
                      <th>TIME</th>
                      <th>REFERENCE</th>
                      <th>ACTIVITY</th>
                      <th>USER / SOURCE</th>
                      <th>LOCATION</th>
                      <th>STATUS</th>
                      <th>VALUE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.map((entry) => (
                      <tr key={entry.key}>
                        <td>{displayDateTime(entry.at)}</td>
                        <td>
                          <strong>{entry.reference}</strong>
                        </td>
                        <td className="activity-name">{entry.action}</td>
                        <td>{entry.actor}</td>
                        <td>{entry.area}</td>
                        <td>
                          <span
                            className={statusPill(
                              entry.status.toLowerCase().replaceAll("_", "-"),
                            )}
                          >
                            {entry.status.replaceAll("_", " ")}
                          </span>
                        </td>
                        <td>{entry.amount ?? "-"}</td>
                      </tr>
                    ))}
                    {!activity.length && (
                      <tr>
                        <td
                          colSpan={7}
                          className="h-[90px] text-center text-[#97a199]"
                        >
                          {loading
                            ? "Loading activity..."
                            : "No recent activity is available."}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </article>
            <article className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 max-[900px]:[min-height:100%]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Cash shifts</h2>
                  <p>Expected compared with counted cash</p>
                </div>
                <span className="text-sm leading-[9px] text-[#a5aea8] tracking-wide">
                  ...
                </span>
              </div>
              <DashboardDataError message={dashboard.reconciliation?.error} />
              <div className="grid gap-0.5">
                {(dashboard.reconciliation?.data?.data ?? [])
                  .filter((shift) => shift.variance !== 0)
                  .slice(0, 5)
                  .map((shift) => (
                    <div
                      className="flex items-center gap-2 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:min-w-0 [&>span:nth-child(2)]:[flex:1] [&_strong]:text-sm [&_strong]:font-normal [&_small]:text-sm [&_small]:text-[#929e96] [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&_b]:text-sm [&_b]:whitespace-nowrap"
                      key={shift.shiftId}
                    >
                      <span className="h-[26px] w-[26px] rounded-full grid [place-items:center] bg-[#eaf1eb] text-[#4b7359] font-normal text-sm [flex:none]">
                        {shift.cashier
                          .split(" ")
                          .map((part) => part[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <span>
                        <strong>{shift.cashier}</strong>
                        <small>
                          {shift.branch} |{" "}
                          {shift.closedAt
                            ? displayDateTime(shift.closedAt)
                            : "closed"}
                        </small>
                      </span>
                      <b
                        className={
                          shift.variance < 0
                            ? "text-[#c45c50]"
                            : "text-[#397853]"
                        }
                      >
                        {money(shift.variance, currency)}
                      </b>
                    </div>
                  ))}
                {!dashboard.reconciliation?.error &&
                  !(dashboard.reconciliation?.data?.data ?? []).some(
                    (shift) => shift.variance !== 0,
                  ) && (
                    <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                      No cash variances in this period.
                    </p>
                  )}
              </div>
              <div className="flex justify-between items-center [margin-top:11px] [padding-top:10px] [border-top:1px_solid_#edf1ed] text-sm text-[#7b887f] [&_strong]:text-sm [&_strong]:text-[#394a40]">
                <span>Net variance for selected period</span>
                <strong>
                  {dashboard.reconciliation?.error
                    ? "Unavailable"
                    : money(
                        dashboard.reconciliation?.data?.summary.totalVariance,
                        currency,
                      )}
                </strong>
              </div>
            </article>
          </section>

          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 mt-0 mx-0 mb-[11px]">
            <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
              <div>
                <h2>Best-selling items</h2>
                <p>By net sales value after recorded refunds | {dateLabel}</p>
              </div>
              <DashboardIcon name="chart" size={17} />
            </div>
            <DashboardDataError
              message={
                !canSeeFinance(user.role)
                  ? "Financial report access is restricted for this role."
                  : dashboard.period?.error
              }
            />
            <div className="grid">
              {canSeeFinance(user.role) &&
                (report?.topProducts ?? []).map((product, index) => (
                  <div
                    className="grid [grid-template-columns:24px_minmax(130px,1fr)_minmax(90px,1.2fr)_auto] items-center gap-2.5 py-[9px] px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] max-[620px]:[grid-template-columns:20px_minmax(0,1fr)_auto] max-[620px]:gap-2"
                    key={product.productId}
                  >
                    <span className="text-[#9ba69e] text-sm font-normal">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="grid gap-[3px] min-w-0 [&_strong]:text-sm [&_strong]:font-normal [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-sm [&_small]:text-[#929e96]">
                      <strong>{product.product}</strong>
                      <small>
                        {product.sku} | {product.quantity.toLocaleString()}{" "}
                        units net
                      </small>
                    </span>
                    <span className="h-[5px] bg-[#f0f3f0] rounded-md overflow-hidden [&_i]:h-full [&_i]:block [&_i]:[min-width:3px] [&_i]:rounded-md [&_i]:bg-[#4b8c68] max-[620px]:[grid-column:2/-1] max-[620px]:[grid-row:2]">
                      <i
                        style={{
                          width: `${report?.topProducts[0]?.revenue ? (product.revenue / report.topProducts[0].revenue) * 100 : 0}%`,
                        }}
                      />
                    </span>
                    <strong className="text-sm font-normal whitespace-nowrap text-[#3a4a40] max-[620px]:[grid-column:3] max-[620px]:[grid-row:1]">
                      {money(product.revenue, currency)}
                    </strong>
                  </div>
                ))}
              {canSeeFinance(user.role) &&
                report &&
                !report.topProducts.length && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    No product sales in this period.
                  </p>
                )}
              {canSeeFinance(user.role) &&
                !report &&
                !dashboard.period?.error && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    Loading product performance...
                  </p>
                )}
            </div>
          </section>

          <section
            className="grid grid-cols-3 gap-3 mb-4 max-[900px]:grid-cols-2 max-[620px]:grid-cols-1 max-[620px]:gap-2"
            id="purchasing"
          >
            <article className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 min-h-[190px] [&>.panel-heading>svg]:text-[#819087] max-[620px]:min-h-[150px]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>
                    {canSeeFinance(user.role)
                      ? "Recent purchases"
                      : "Recent purchase orders"}
                  </h2>
                  <p>
                    {canSeeFinance(user.role)
                      ? `Items received | ${dateLabel}`
                      : "Latest supplier orders"}
                  </p>
                </div>
                <DashboardIcon name="cart" size={17} />
              </div>
              <DashboardDataError
                message={
                  canSeeFinance(user.role)
                    ? dashboard.receipts?.error
                    : dashboard.purchases?.error
                }
              />
              <div className="grid">
                {canSeeFinance(user.role)
                  ? (dashboard.receipts?.data?.data ?? [])
                      .slice(0, 5)
                      .map((receipt) => (
                        <div
                          key={`${receipt.receipt}-${receipt.sku}`}
                          className="flex items-center gap-2 py-2 px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:[flex:1] [&>span:nth-child(2)]:min-w-0 [&_strong]:text-sm [&_strong]:font-normal [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-sm [&_small]:text-[#939e97] [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&>b]:text-sm [&>b]:whitespace-nowrap"
                        >
                          <span className="h-[26px] w-[26px] rounded-md bg-[#edf5ef] text-[#488466] grid [place-items:center] [flex:none] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c]">
                            <DashboardIcon name="receipt" size={15} />
                          </span>
                          <span>
                            <strong>
                              {receipt.receipt} | {receipt.product}
                            </strong>
                            <small>
                              {receipt.supplier} | {displayDate(receipt.date)}
                            </small>
                          </span>
                          <b>{receipt.quantity} units</b>
                        </div>
                      ))
                  : (dashboard.purchases?.data?.data ?? [])
                      .slice(0, 5)
                      .map((purchase) => (
                        <div
                          key={purchase.id}
                          className="flex items-center gap-2 py-2 px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:[flex:1] [&>span:nth-child(2)]:min-w-0 [&_strong]:text-sm [&_strong]:font-normal [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-sm [&_small]:text-[#939e97] [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&>b]:text-sm [&>b]:whitespace-nowrap"
                        >
                          <span className="h-[26px] w-[26px] rounded-md bg-[#edf5ef] text-[#488466] grid [place-items:center] [flex:none] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c]">
                            <DashboardIcon name="receipt" size={15} />
                          </span>
                          <span>
                            <strong>{purchase.number}</strong>
                            <small>
                              {purchase.supplier.name} | {purchase.branch.name}
                            </small>
                          </span>
                          <span
                            className={statusPill(
                              purchase.status
                                .toLowerCase()
                                .replaceAll("_", "-"),
                            )}
                          >
                            {purchase.status.replaceAll("_", " ")}
                          </span>
                        </div>
                      ))}
                {canSeeFinance(user.role) &&
                  !dashboard.receipts?.error &&
                  !dashboard.receipts?.data?.data.length && (
                    <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                      No goods receipts in this period.
                    </p>
                  )}
                {!canSeeFinance(user.role) &&
                  !dashboard.purchases?.error &&
                  !dashboard.purchases?.data?.data.length && (
                    <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                      No purchase orders yet.
                    </p>
                  )}
              </div>
            </article>
            <article className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 min-h-[190px] [&>.panel-heading>svg]:text-[#819087] max-[620px]:min-h-[150px]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Orders to process</h2>
                  <p>Paid online orders not yet fulfilled</p>
                </div>
                <DashboardIcon name="receipt" size={17} />
              </div>
              <DashboardDataError message={dashboard.orders?.error} />
              <div className="grid">
                {(pendingOrders ?? []).slice(0, 5).map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center gap-2 py-2 px-0 [border-bottom:1px_solid_#eff2ef] [&:last-child]:[border-bottom:0] [&>span:nth-child(2)]:grid [&>span:nth-child(2)]:gap-[3px] [&>span:nth-child(2)]:[flex:1] [&>span:nth-child(2)]:min-w-0 [&_strong]:text-sm [&_strong]:font-normal [&_strong]:overflow-hidden [&_strong]:text-ellipsis [&_strong]:whitespace-nowrap [&_small]:text-sm [&_small]:text-[#939e97] [&_small]:overflow-hidden [&_small]:text-ellipsis [&_small]:whitespace-nowrap [&>b]:text-sm [&>b]:whitespace-nowrap"
                  >
                    <span className="h-[26px] w-[26px] rounded-md bg-[#edf5ef] text-[#488466] grid [place-items:center] [flex:none] [&.blue]:bg-[#edf4f9] [&.blue]:text-[#4d7c9c] blue">
                      <DashboardIcon name="cart" size={15} />
                    </span>
                    <span>
                      <strong>{order.number}</strong>
                      <small>
                        {displayDateTime(order.createdAt)} |{" "}
                        {order.status.replaceAll("_", " ")}
                      </small>
                    </span>
                    <b>{money(Number(order.total), currency)}</b>
                  </div>
                ))}
                {!dashboard.orders?.error && !pendingOrderCount && (
                  <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                    No paid online orders are waiting for fulfillment.
                  </p>
                )}
              </div>
            </article>
            <article className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 min-h-[190px] [&>.panel-heading>svg]:text-[#819087] max-[620px]:min-h-[150px]">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Stock near expiry</h2>
                  <p>Lots expiring in the next 30 days</p>
                </div>
                <DashboardIcon name="clock" size={17} />
              </div>
              <DashboardDataError message={dashboard.inventory?.error} />
              <div className="h-[130px] flex flex-col items-center justify-center text-center [&_strong]:text-lg [&_strong]:font-normal [&_p]:text-sm [&_p]:leading-[1.45] [&_p]:text-[#98a29b] [&_p]:max-w-[180px] [&_p]:mt-1 mx-0 mb-0">
                <span className="h-[31px] w-[31px] rounded-full grid [place-items:center] text-[#738c79] bg-[#edf4ee] [margin-bottom:6px]">
                  <DashboardIcon name="clock" size={18} />
                </span>
                <strong>
                  {expiringLots ??
                    (dashboard.inventory?.error ? "Unavailable" : "-")}
                </strong>
                <p>
                  Active batches expiring within 30 days across{" "}
                  {branchId ? "the selected branch" : "all branches"}.
                </p>
              </div>
            </article>
          </section>

          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger | Business operations</span>
            <span>
              Home figures refresh from the API and respect your access role.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}

