import AdminDashboard from "./dashboard-client";

// This dashboard is a client-driven workspace and is not an instant-navigation segment.
export const instant = false;

export default function AdminPage() {
  return <AdminDashboard />;
}
