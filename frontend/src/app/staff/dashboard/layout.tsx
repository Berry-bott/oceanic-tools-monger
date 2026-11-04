import type { ReactNode } from "react";
import { AdminWorkspaceShell } from "@/components/admin-workspace-shell";

export default function StaffDashboardLayout({ children }: { children: ReactNode }) {
  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
