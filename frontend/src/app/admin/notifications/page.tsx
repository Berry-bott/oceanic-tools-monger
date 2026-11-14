"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { apiRequest } from "@/lib/api";
import { AdminTableSkeleton } from "@/components/admin-loading-skeleton";

type Notification = {
  id: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  readAt: string | null;
};

const displayDate = (value: string) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(date)
    : "Date unavailable";
};

export default function AdminNotificationsPage() {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: () => apiRequest<{ data: Notification[]; unreadCount: number }>("/notifications"),
    enabled: Boolean(currentUser.data?.user),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => apiRequest(`/notifications/${encodeURIComponent(id)}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-notifications"] }),
  });

  return (
    <main className="mx-auto w-full max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-5 flex items-end justify-between gap-4 max-sm:items-start max-sm:flex-col">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wide text-brand">BUSINESS UPDATES</p>
          <h1 className="m-0 text-2xl font-semibold text-ink">Notifications</h1>
          <p className="mb-0 mt-2 text-sm text-muted">Review recent activity and important updates.</p>
        </div>
        <span className="rounded-full bg-[#edf5ef] px-3 py-1.5 text-xs font-medium text-brand">{notifications.data?.unreadCount ?? 0} unread</span>
      </header>

      {notifications.isError && <section role="alert" className="rounded-xl border border-[#f0d7d2] bg-white p-5 text-sm text-[#a75043]">Notifications could not be loaded. Check your connection and try again.</section>}
      {notifications.isLoading && <section className="overflow-hidden rounded-xl border border-line bg-white"><AdminTableSkeleton columns={3} rows={5} /></section>}
      {!notifications.isLoading && !notifications.isError && !notifications.data?.data.length && <section className="grid min-h-52 place-items-center rounded-xl border border-line bg-white p-6 text-center"><div><strong className="text-sm font-medium text-ink">You are all caught up</strong><p className="mb-0 mt-2 text-sm text-muted">New business updates will appear here.</p></div></section>}

      <section className="grid gap-3" aria-label="Business notifications">
        {notifications.data?.data.map((notice) => (
          <article key={notice.id} className={`flex items-start gap-3 rounded-xl border border-line bg-white p-4 ${notice.readAt ? "" : "border-l-4 border-l-brand"}`}>
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[#edf5ef] text-brand"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg></span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="m-0 text-sm font-semibold text-ink">{notice.title}</h2>
                <time className="text-xs text-muted" dateTime={notice.createdAt}>{displayDate(notice.createdAt)}</time>
              </div>
              <p className="mb-0 mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[#536159]">{notice.message}</p>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-xs capitalize text-muted">{notice.type.toLowerCase().replaceAll("_", " ")}{notice.severity === "INFO" ? "" : ` · ${notice.severity.toLowerCase()}`}</span>
                {notice.type === "ONLINE_RETURN" && <Link href="/admin/orders" className="text-xs font-medium text-brand underline">Open online orders</Link>}
                {!notice.readAt && <button type="button" onClick={() => markRead.mutate(notice.id)} disabled={markRead.isPending} className="cursor-pointer text-xs font-medium text-brand hover:underline disabled:cursor-wait disabled:opacity-60">Mark as read</button>}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
