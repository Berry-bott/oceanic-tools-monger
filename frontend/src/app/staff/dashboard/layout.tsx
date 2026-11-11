import type { ReactNode } from "react";
import { AdminWorkspaceShell } from "@/components/admin-workspace-shell";
import { AdminRouteGuard } from "@/components/admin-route-guard";

export default function StaffDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AdminRouteGuard>
      <AdminWorkspaceShell>{children}</AdminWorkspaceShell>
    </AdminRouteGuard>
  );
}
