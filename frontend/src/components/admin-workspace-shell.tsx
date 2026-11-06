"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { AdminNavIcon } from "@/components/admin-nav-icon";
import { useMarkNotificationRead } from "@/hooks/mutations/use-mark-notification-read";
import { apiRequest } from "@/lib/api";
import { signOut } from "@/services/auth/auth.service";
import { usePosCartStore } from "@/stores/pos-cart.store";
import { useBranchStore } from "@/stores/branch.store";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminPageEntrance } from "@/components/admin-motion";
import { AdminEmptyState } from "@/components/admin-empty-state";

const navigation: { section: string; label: string; href: string; ownerOnly?: boolean; icon: string }[] = [
  { section: "Sell", label: "Overview", href: "/admin", icon: "home" },
  { section: "Sell", label: "Point of sale", href: "/admin/sales", icon: "sales" },
  { section: "Sell", label: "Installments", href: "/admin/sales/installments", icon: "installments" },
  { section: "Inventory", label: "Products", href: "/admin/products", icon: "products" },
  { section: "Inventory", label: "Stock", href: "/admin/inventory", icon: "inventory" },
  { section: "Inventory", label: "Buy stock", href: "/admin/purchasing", icon: "purchasing" },
  { section: "Customers", label: "Customers", href: "/admin/customers", icon: "customers" },
  { section: "Customers", label: "Notes", href: "/admin/notes", icon: "notes" },
  { section: "Customers", label: "Online orders", href: "/admin/orders", icon: "orders" },
  { section: "Money", label: "Money & reports", href: "/admin/finance", icon: "finance" },
  { section: "Money", label: "Reports", href: "/admin/reports", icon: "finance" },
  { section: "Money", label: "Creditors", href: "/admin/creditors", ownerOnly: true, icon: "creditors" },
  { section: "Manage", label: "Notifications", href: "/admin/notifications", ownerOnly: true, icon: "notifications" },
  { section: "Manage", label: "Staff", href: "/admin/staff", ownerOnly: true, icon: "settings" },
  { section: "Manage", label: "Audit history", href: "/admin/audit-logs", ownerOnly: true, icon: "settings" },
  { section: "Manage", label: "Settings", href: "/admin/settings", ownerOnly: true, icon: "settings" },
];

export function AdminWorkspaceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUserQuery = useCurrentUser();
  const notificationsQuery = useQuery({
    queryKey: ["workspace-notifications"],
    queryFn: () => apiRequest<{ data: { id: string; title: string; message: string; createdAt: string; readAt: string | null }[]; unreadCount: number }>("/notifications"),
    enabled: Boolean(currentUserQuery.data),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
  const markNotificationRead = useMarkNotificationRead();
  const isStaff = currentUserQuery.data?.user.role === "STAFF";
  const visibleNavigation = navigation.filter((item) => !item.ownerOnly || !isStaff);
  const navigationSections = Array.from(new Set(visibleNavigation.map((item) => item.section)));
  const homeHref = isStaff ? "/staff/dashboard" : "/admin";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const isNavigationItemActive = (item: (typeof navigation)[number]) => item.href === "/admin"
    ? pathname === item.href || pathname.startsWith("/staff")
    : item.href === "/admin/sales"
      ? pathname === item.href || (pathname.startsWith(`${item.href}/`) && !pathname.startsWith("/admin/sales/installments"))
      : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const current = visibleNavigation.find(isNavigationItemActive) ?? visibleNavigation[0];

  useEffect(() => {
    const openNavigation = () => setMobileOpen(true);
    window.addEventListener("open-admin-navigation", openNavigation);
    return () => window.removeEventListener("open-admin-navigation", openNavigation);
  }, []);

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } catch {
      // Logout is best effort: do not keep the user in the workspace if the
      // API cannot revoke the server session. The request has a short timeout.
    } finally {
      queryClient.clear();
      usePosCartStore.getState().clearCart();
      useBranchStore.getState().clearSelectedBranch();
      setSigningOut(false);
      router.replace(isStaff ? "/staff/login" : "/oceanicadminlogin");
    }
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-[#1a1d1f] [&_h1]:[font-weight:700] [&_h2]:[font-weight:700] [&_h3]:[font-weight:700] [&_strong]:[font-weight:400] [&_b]:[font-weight:400]">
      {mobileOpen && <button className="fixed inset-0 z-30 bg-black/40 lg:hidden" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[240px] flex-col border-r border-[#203131] bg-[#0c1919] px-4 py-6 text-white transition-transform lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <Link className="mb-9 flex h-10 items-center gap-3 px-1" href={homeHref} onClick={() => setMobileOpen(false)} aria-label="OceanicToolsMonger home">
          <span className="grid size-9 place-items-center rounded-xl bg-[#149e8f] text-lg font-normal">O</span>
          <span className="text-lg font-normal tracking-tight">OceanicToolsMonger</span>
        </Link>
        <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Admin pages">
          {navigationSections.map((section) => (
            <div key={section}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#aebfbc]">
                {section}
              </p>
              <div className="space-y-1">
                {visibleNavigation
                  .filter((item) => item.section === section)
                  .map((item) => {
                    const href = isStaff && item.href === "/admin" ? "/staff/dashboard" : item.href;
                    const active = isNavigationItemActive(item);

                    return (
                      <Link
                        key={item.href}
                        href={href}
                        onClick={() => setMobileOpen(false)}
                        aria-current={active ? "page" : undefined}
                        className={`group flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-[background-color,color,box-shadow,transform] duration-150 ${active ? "bg-brand text-white shadow-[0_2px_8px_rgba(20,158,143,.24)]" : "text-[#aebfbc] hover:translate-x-0.5 hover:bg-white/10 hover:text-white"}`}
                      >
                        <span className={`transition-transform duration-150 ${active ? "scale-105" : "group-hover:scale-105"}`}>
                          <AdminNavIcon name={item.icon} />
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}
              </div>
            </div>
          ))}
        </nav>
        <div className="mt-4 border-t border-[#263737] px-3 pt-4">
          <p className="mb-3 text-xs text-[#aebfbc]">Stock, sales and money</p>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-[#aebfbc] transition-colors hover:bg-[#142727] hover:text-white disabled:opacity-60"
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 17l5-5-5-5" />
              <path d="M15 12H3" />
              <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
            </svg>
            {signingOut ? "Signing out..." : "Sign out"}
          </button>
        </div>
      </aside>

      <div className="min-h-screen lg:ml-[240px]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
          <button className="grid size-9 place-items-center rounded-xl border border-line text-[#415047] lg:hidden" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Workspace</span><span className="hidden text-[#abb3ae] sm:inline">/</span>
            <strong className="font-medium text-[#3d4c44]">{current.label}</strong>
          </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <Link href="/admin/notes" aria-label="Open notes" title="Notes" className={`grid size-9 place-items-center rounded-lg transition-colors ${pathname.startsWith("/admin/notes") ? "bg-[#edf5ef] text-brand" : "text-[#76837b] hover:bg-[#f1f6f2]"}`}>
              <AdminNavIcon name="notes" />
            </Link>
            <span className="hidden items-center gap-1.5 text-xs text-[#738079] sm:flex"><i className="size-1.5 rounded-full bg-[#54a576]" />Live business data</span>
            <button type="button" className="relative grid size-9 cursor-pointer place-items-center rounded-lg text-[#76837b] hover:bg-[#f1f6f2]" aria-label={`${notificationsQuery.data?.unreadCount ?? 0} unread notifications`} onClick={() => setNotificationsOpen((value) => !value)}>
              <AdminNavIcon name="notifications" />
              {(notificationsQuery.data?.unreadCount ?? 0) > 0 && <span className="absolute right-0.5 top-0.5 grid min-h-4 min-w-4 place-items-center rounded-full bg-[#d56f5c] px-1 text-[10px] text-white">{notificationsQuery.data?.unreadCount}</span>}
            </button>
            <span className="h-6 w-px bg-line" />
            <span className="grid size-8 place-items-center rounded-full bg-[#153c3a] text-xs text-[#7fddd2]">{(currentUserQuery.data?.user.name ?? "O").split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
          </div>
          {notificationsOpen && <AdminPageEntrance className="absolute right-4 top-14 z-40 max-h-[450px] w-[min(360px,calc(100vw-28px))] overflow-auto rounded-[14px] border border-line bg-white p-3 shadow-xl sm:right-8">
            <div className="flex justify-between border-b border-line px-1 pb-2 text-sm"><strong>Notifications</strong><span className="text-muted">{notificationsQuery.data?.unreadCount ?? 0} unread</span></div>
            {notificationsQuery.data?.data.slice(0, 8).map((notice) => <button key={notice.id} type="button" className={`grid w-full cursor-pointer gap-1 border-b border-line p-2 text-left hover:bg-canvas ${notice.readAt ? "" : "bg-[#f7faf7]"}`} onClick={() => { void markNotificationRead.mutateAsync(notice.id).then(() => queryClient.invalidateQueries({ queryKey: ["workspace-notifications"] })); }}><strong className="text-sm font-medium">{notice.title}</strong><span className="text-xs text-muted">{notice.message}</span><small className="text-[11px] text-muted">{Number.isFinite(new Date(notice.createdAt).getTime()) ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(notice.createdAt)) : "Date unavailable"}</small></button>)}
            {!notificationsQuery.data?.data.length && <AdminEmptyState icon="bell" title="You’re all caught up" description="New business alerts will show up here." />}
          </AdminPageEntrance>}
        </header>
        <AdminPageEntrance key={pathname}>{children}</AdminPageEntrance>
      </div>
    </div>
  );
}
