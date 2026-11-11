import type { ReactNode } from "react";
import { AdminWorkspaceShell } from "@/components/admin-workspace-shell";
import { AdminRouteGuard } from "@/components/admin-route-guard";

// The auth guard withholds admin segments while it checks the session
export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AdminRouteGuard>
      <AdminWorkspaceShell>{children}</AdminWorkspaceShell>
    </AdminRouteGuard>
  );
}
