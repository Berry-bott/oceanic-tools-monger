import { apiDownload } from "@/lib/api";

export type WeeklyPerformanceParams = {
  from: string;
  to: string;
  branchId?: string;
  format?: "csv" | "xlsx" | "pdf";
};

export function downloadWeeklyPerformance(params: WeeklyPerformanceParams) {
  const query = new URLSearchParams({
    from: params.from,
    to: params.to,
    format: params.format ?? "xlsx",
  });
  if (params.branchId) query.set("branchId", params.branchId);
  return apiDownload(`/reports/weekly-performance?${query.toString()}`);
}
