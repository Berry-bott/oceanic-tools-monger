import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function DashboardIcon({
  name,
  size = 18,
}: {
  name: string;
  size?: number;
}) {
  const icons: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="3" width="7" height="7" rx="1.5" />
        <rect x="14" y="14" width="7" height="7" rx="1.5" />
        <rect x="3" y="14" width="7" height="7" rx="1.5" />
      </>
    ),
    package: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="M3 8v9l9 5 9-5V8M12 13v9" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    cart: (
      <>
        <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h8.9a2 2 0 0 0 2-1.6L22 8H6" />
        <circle cx="10" cy="20" r="1" />
        <circle cx="18" cy="20" r="1" />
      </>
    ),
    scan: (
      <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3m8 0h3a1 1 0 0 1 1 1v3M4 16v3a1 1 0 0 0 1 1h3m8 0h3a1 1 0 0 0 1-1v-3M4 12h16" />
      </>
    ),
    receipt: (
      <>
        <path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" />
        <path d="M9 8h6M9 12h6M9 16h3" />
      </>
    ),
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="10" cy="7" r="4" />
        <path d="M20 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
      </>
    ),
    chart: (
      <>
        <path d="M3 3v18h18" />
        <path d="m7 14 4-4 4 3 6-7" />
      </>
    ),
    wallet: (
      <>
        <rect x="3" y="5" width="18" height="15" rx="2" />
        <path d="M3 9h18m-5 5h2M6 5V3h12v2" />
      </>
    ),
    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    arrow: (
      <>
        <path d="M7 17 17 7M7 7h10v10" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3" />
      </>
    ),
    close: (
      <>
        <path d="m18 6-12 12M6 6l12 12" />
      </>
    ),
    menu: (
      <>
        <path d="M4 6h16M4 12h16M4 18h16" />
      </>
    ),
    chevron: <path d="m9 18 6-6-6-6" />,
    download: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    alert: (
      <>
        <path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" />
        <path d="M12 9v4m0 4h.01" />
      </>
    ),
  };
  return (
    <svg
      className="shrink-0"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icons[name] ?? icons.package}
    </svg>
  );
}

export function DashboardDataError({ message }: { message?: string }) {
  void message;
  return null;
}

export function DashboardSummaryCard({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: string;
  note: string;
  tone?: "default" | "warning";
}) {
  return (
    <article className="grid min-h-[106px] gap-2 rounded-xl border border-line bg-white p-5 max-[620px]:min-h-[91px] max-[620px]:p-3.5">
      <span className="text-sm text-[#75827a]">{label}</span>
      <strong
        className={`text-2xl leading-none font-normal tracking-tight max-[620px]:text-xl ${tone === "warning" ? "text-[#a6782c]" : "text-[#26372d]"}`}
      >
        {value}
      </strong>
      <small className="text-sm text-[#9aa49d]">{note}</small>
    </article>
  );
}

export function DashboardPageHeading({
  greeting,
  userName,
  businessName,
  loading,
  onRefresh,
  canExport,
  onExport,
  workspaceLabel = "BUSINESS OVERVIEW",
}: {
  greeting: string;
  userName: string;
  businessName: string;
  loading: boolean;
  onRefresh: () => void;
  canExport: boolean;
  onExport: () => void;
  workspaceLabel?: string;
}) {
  return (
    <section className="mb-5 flex items-end justify-between gap-4 max-[620px]:mb-4 max-[620px]:flex-col max-[620px]:items-start">
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm tracking-widest text-[#89968e]">
          <span className="size-1.5 rounded-full bg-[#62a47e]" /> {workspaceLabel}
        </p>
        <h1 className="m-0 text-[25px] font-bold leading-tight tracking-tight text-[#1a2a22] max-[620px]:text-[22px]">
          Good {greeting}, {userName.split(" ")[0]}
        </h1>
        <p className="mt-1.5 text-sm text-[#829087]">
          Here&apos;s what&apos;s happening across {businessName}.
        </p>
      </div>
      <div className="flex gap-2 max-[620px]:w-full [&_button]:max-[620px]:flex-1">
        <button
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#4e5e54] hover:bg-[#f8faf8]"
          onClick={onRefresh}
          disabled={loading}
        >
          <DashboardIcon name="refresh" size={15} />
          {loading ? "Refreshing" : "Refresh"}
        </button>
        {canExport && (
          <button
            className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#e0e7e1] bg-white px-3 text-sm text-[#4e5e54] hover:bg-[#f8faf8]"
            onClick={onExport}
          >
            <DashboardIcon name="download" size={15} /> Export report
          </button>
        )}
      </div>
    </section>
  );
}

export function DashboardFilters({
  businessName,
  timezone,
  branches,
  branchId,
  onBranchChange,
  preset,
  onPresetChange,
  range,
  onRangeChange,
}: {
  businessName: string;
  timezone?: string;
  branches: { id: string; name: string; isDefault: boolean }[];
  branchId: string;
  onBranchChange: (value: string) => void;
  preset: string;
  onPresetChange: (value: string) => void;
  range: { from: string; to: string };
  onRangeChange: (value: { from: string; to: string }) => void;
}) {
  const fieldClass =
    "flex items-center gap-2 text-sm text-[#77847b] max-[620px]:flex-1 max-[620px]:flex-col max-[620px]:items-stretch max-[620px]:gap-1";
  const selectClass =
    "h-[34px] max-w-[200px] rounded-md border border-[#e1e8e2] bg-white px-2 text-sm text-[#435249] outline-none focus:border-[#73a48a] max-[620px]:max-w-none";
  return (
    <section className="mb-4 flex min-h-[59px] items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2.5 max-[620px]:flex-col max-[620px]:items-start">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 place-items-center rounded-lg bg-[#edf3ee] text-sm text-[#32674f]">
          {businessName.slice(0, 1).toUpperCase()}
        </span>
        <span className="grid gap-1">
          <strong className="text-sm">{businessName}</strong>
          <small className="text-sm text-[#929d96]">
            {timezone ?? "Timezone from your business settings"}
          </small>
        </span>
      </div>
      <div className="flex items-center gap-3 max-[620px]:w-full max-[620px]:flex-wrap max-[620px]:gap-2">
        <label className={fieldClass}>
          <span>Shop</span>
          <select
            className={selectClass}
            value={branchId}
            onChange={(event) => onBranchChange(event.target.value)}
          >
            {branches.map((branch) => (
              <option value={branch.id} key={branch.id}>
                {branch.name}
                {branch.isDefault ? " (Main store)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className={fieldClass}>
          <span>Date range</span>
          <select
            className={selectClass}
            value={preset}
            onChange={(event) => onPresetChange(event.target.value)}
          >
            <option value="today">Today</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="month">This month</option>
            <option value="custom">Custom range</option>
          </select>
        </label>
        {preset === "custom" && (
          <div className="flex items-center gap-1.5 text-sm text-[#88958d] max-[620px]:w-full max-[620px]:justify-between">
            <input
              className="h-[30px] w-[120px] rounded-md border border-[#e4e9e4] bg-white px-2 text-sm text-[#3e4e45] max-[620px]:w-[calc(50%-22px)]"
              type="date"
              aria-label="From date"
              value={range.from}
              onChange={(event) =>
                onRangeChange({ ...range, from: event.target.value })
              }
            />
            <span>to</span>
            <input
              className="h-[30px] w-[120px] rounded-md border border-[#e4e9e4] bg-white px-2 text-sm text-[#3e4e45] max-[620px]:w-[calc(50%-22px)]"
              type="date"
              aria-label="To date"
              value={range.to}
              onChange={(event) =>
                onRangeChange({ ...range, to: event.target.value })
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}

export function DashboardMetricCard({
  label,
  value,
  detail,
  icon,
  tone = "green",
  error,
  href,
}: {
  label: string;
  value: string;
  detail: string;
  icon: string;
  tone?: string;
  error?: string;
  href: string;
}) {
  const restricted = Boolean(
    error?.includes("role") || error?.includes("cost"),
  );
  return (
    <Link
      className="flex min-h-28 min-w-0 flex-col rounded-xl border border-line bg-white p-5 shadow-sm transition-colors hover:border-[#cbdacf] max-[620px]:min-h-[105px] max-[620px]:p-3.5"
      href={href}
    >
      <div className="flex items-center justify-between text-sm text-[#6e7b73]">
        <span>{label}</span>
        <span
          className={`grid size-7 place-items-center rounded-lg bg-[#edf5ef] text-[#478264] max-[620px]:size-6 ${tone === "amber" ? "bg-[#fff5e6] text-[#b7832b]" : tone === "blue" ? "bg-[#edf4f9] text-[#4d7c9c]" : tone === "violet" ? "bg-[#f2eff9] text-[#7767a8]" : ""}`}
        >
          <DashboardIcon name={icon} size={17} />
        </span>
      </div>
      <span className="my-2 truncate text-[21px] tracking-tight text-[#202f27] max-[620px]:text-[17px]">
        {error ? (restricted ? "Restricted" : "—") : value}
      </span>
      <span className="mt-auto text-[11px] leading-snug text-[#8c9890]">
        {restricted ? error : detail}
      </span>
    </Link>
  );
}

export function DashboardOverviewSkeleton() {
  const pulse = "animate-pulse rounded-md bg-[#edf1ed]";

  return (
    <div className="space-y-4" aria-label="Loading dashboard" aria-busy="true">
      <div className="h-[59px] rounded-xl border border-line bg-white p-4">
        <div className={`${pulse} h-7 w-full max-w-[520px]`} />
      </div>
      <section className="grid grid-cols-4 gap-3 max-[900px]:grid-cols-2 max-[620px]:gap-2" aria-hidden="true">
        {Array.from({ length: 4 }, (_, index) => (
          <article key={index} className="grid min-h-28 gap-3 rounded-xl border border-line bg-white p-5 max-[620px]:min-h-[105px] max-[620px]:p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className={`${pulse} h-4 w-2/3`} />
              <div className={`${pulse} size-7 rounded-lg`} />
            </div>
            <div className={`${pulse} h-6 w-1/2`} />
            <div className={`${pulse} h-3 w-4/5`} />
          </article>
        ))}
      </section>
      <section className="grid grid-cols-[minmax(0,1.8fr)_minmax(270px,1fr)] gap-3 max-[900px]:grid-cols-1" aria-hidden="true">
        <article className="min-h-[340px] rounded-xl border border-line bg-white p-5">
          <div className={`${pulse} mb-2 h-5 w-40`} />
          <div className={`${pulse} mb-6 h-3 w-64 max-w-full`} />
          <div className={`${pulse} h-[240px] w-full rounded-lg`} />
        </article>
        <article className="min-h-[340px] rounded-xl border border-line bg-white p-5">
          <div className={`${pulse} mb-6 h-5 w-36`} />
          <div className="space-y-5">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="flex items-center gap-3">
                <div className={`${pulse} size-8 rounded-lg`} />
                <div className="flex-1 space-y-2">
                  <div className={`${pulse} h-3 w-3/4`} />
                  <div className={`${pulse} h-3 w-1/2`} />
                </div>
                <div className={`${pulse} h-4 w-14`} />
              </div>
            ))}
          </div>
        </article>
      </section>
      <section className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[620px]:grid-cols-1" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <article key={index} className="min-h-40 rounded-xl border border-line bg-white p-5">
            <div className={`${pulse} mb-5 h-5 w-36`} />
            <div className="space-y-4">
              {Array.from({ length: 3 }, (_, row) => (
                <div key={row} className="flex items-center justify-between gap-4">
                  <div className={`${pulse} h-3 w-2/3`} />
                  <div className={`${pulse} h-3 w-12`} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

type ChartReport = {
  byDay: { date: string; netSales: number; grossProfit: number }[];
};
type ChartRange = { from: string; to: string };
type ChartPoint = {
  date: string;
  netSales: number;
  grossProfit: number;
  previousNetSales?: number;
};

export function DashboardSalesChart({
  report,
  previousReport,
  previousRange,
  currency,
  range,
  formatMoney,
  formatDate,
}: {
  report?: ChartReport;
  previousReport?: ChartReport;
  previousRange: ChartRange;
  currency: string;
  range: ChartRange;
  formatMoney: (amount: number, currency: string) => string;
  formatDate: (date: string) => string;
}) {
  const [showGrossProfit, setShowGrossProfit] = useState(true);
  const [showPreviousPeriod, setShowPreviousPeriod] = useState(false);
  const points = report?.byDay ?? [];
  const previousPoints = previousReport?.byDay ?? [];
  const datesInRange = (from: string, to: string) => {
    if (![from, to].every((date) => Number.isFinite(Date.parse(date + "T12:00:00Z")))) {
      return [];
    }
    const dates: string[] = [];
    const cursor = new Date(from + "T12:00:00Z");
    const end = new Date(to + "T12:00:00Z");
    while (cursor <= end && dates.length < 1100) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  };

  const currentByDate = new Map(points.map((point) => [point.date, point]));
  const previousByDate = new Map(previousPoints.map((point) => [point.date, point]));
  const chartDates = datesInRange(range.from, range.to);
  const comparisonDates = datesInRange(previousRange.from, previousRange.to);
  const chartData: ChartPoint[] = chartDates.length
    ? chartDates.map((date, index) => ({
        date,
        netSales: currentByDate.get(date)?.netSales ?? 0,
        grossProfit: currentByDate.get(date)?.grossProfit ?? 0,
        previousNetSales: previousByDate.get(comparisonDates[index] ?? "")?.netSales ?? 0,
      }))
    : points.map((point, index) => ({
        ...point,
        previousNetSales: previousPoints[index]?.netSales ?? 0,
      }));

  const hasCurrentSales = Boolean(report && points.length);
  const hasPreviousSales = Boolean(previousReport && previousPoints.length);
  const compactMoney = (value: number) =>
    new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  const toggleClass = (active: boolean) =>
    [
      "inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
      active
        ? "border-brand bg-[#eff8f2] text-ink"
        : "border-line bg-white text-muted hover:bg-canvas",
    ].join(" ");

  return (
    <div className="w-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="mr-auto text-xs text-muted">
          Daily totals / {currency}
        </span>
        <span className="inline-flex items-center gap-2 px-2 text-xs text-ink">
          <i className="size-2.5 rounded-full bg-[#149e8f]" />
          Net sales
        </span>
        <button
          type="button"
          aria-pressed={showGrossProfit}
          onClick={() => setShowGrossProfit((value) => !value)}
          className={toggleClass(showGrossProfit)}
        >
          <i className="size-2.5 rounded-full bg-[#fca5a5]" />
          Gross profit
        </button>
        {hasPreviousSales && (
          <button
            type="button"
            aria-pressed={showPreviousPeriod}
            onClick={() => setShowPreviousPeriod((value) => !value)}
            className={toggleClass(showPreviousPeriod)}
          >
            <i className="size-2.5 rounded-full bg-[#8b9b92]" />
            Previous period
          </button>
        )}
      </div>

      <div
        className="h-[240px] w-full"
        role="img"
        aria-label={"Daily sales report from " + range.from + " to " + range.to}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="sales-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#149e8f" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#149e8f" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="profit-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#fca5a5" stopOpacity={0.08} />
                <stop offset="95%" stopColor="#fca5a5" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="#f1f1f1"
            />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9a9fa5" }}
              tickFormatter={(value: string) => formatDate(value)}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: "#9a9fa5" }}
              tickFormatter={(value: number) => compactMoney(value)}
              domain={[0, (dataMax: number) => Math.max(1, dataMax)]}
            />
            <Tooltip
              labelFormatter={(value) => formatDate(String(value))}
              formatter={(value, name) => [
                formatMoney(Number(value), currency),
                name,
              ]}
              contentStyle={{
                border: "1px solid #e7ece8",
                borderRadius: 10,
                boxShadow: "0 8px 24px #17251f14",
                fontSize: 12,
              }}
              labelStyle={{ color: "#172720", fontWeight: 600 }}
              itemStyle={{ color: "#536159" }}
            />
            <Area
              type="monotone"
              dataKey="netSales"
              name="Net sales"
              stroke="#149e8f"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#sales-gradient)"
              activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
            />
            {showGrossProfit && (
              <Area
                type="monotone"
                dataKey="grossProfit"
                name="Gross profit"
                stroke="#fca5a5"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={1}
                fill="url(#profit-gradient)"
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
              />
            )}
            {showPreviousPeriod && (
              <Area
                type="monotone"
                dataKey="previousNetSales"
                name="Previous period"
                stroke="#8b9b92"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fill="none"
                activeDot={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {!hasCurrentSales && (
        <p className="mt-1 text-center text-xs text-muted" role="status">
          {report
            ? "No completed sales in this date range yet. Sales are shown as zero."
            : "Sales trend is loading or unavailable."}
        </p>
      )}

      {hasCurrentSales && (
        <details className="mt-2 border-t border-line pt-2 text-xs">
          <summary className="w-fit cursor-pointer text-brand hover:underline">
            View chart data
          </summary>
          <div className="mt-2 max-h-56 overflow-auto">
            <table className="w-full text-left">
              <caption className="sr-only">
                Daily sales chart data from {range.from} to {range.to}
              </caption>
              <thead className="sticky top-0 bg-canvas text-muted">
                <tr>
                  <th className="p-2 font-normal">Date</th>
                  <th className="p-2 text-right font-normal">Net sales</th>
                  {showGrossProfit && (
                    <th className="p-2 text-right font-normal">Gross profit</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {chartData.map((point) => (
                  <tr className="border-t border-line" key={point.date}>
                    <td className="p-2">{formatDate(point.date)}</td>
                    <td className="p-2 text-right tabular-nums">
                      {formatMoney(point.netSales, currency)}
                    </td>
                    {showGrossProfit && (
                      <td className="p-2 text-right tabular-nums">
                        {formatMoney(point.grossProfit, currency)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  );
}
