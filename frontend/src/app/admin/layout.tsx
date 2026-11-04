import type { ReactNode } from "react";
import { AdminWorkspaceShell } from "@/components/admin-workspace-shell";

// The root auth guard intentionally withholds admin segments while it checks
// the session, so this layout cannot participate in instant-navigation checks.
export const instant = false;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminWorkspaceShell>{children}</AdminWorkspaceShell>;
}
