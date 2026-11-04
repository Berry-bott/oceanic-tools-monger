"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import {
  ADMIN_SESSION_EXPIRED_EVENT,
  ADMIN_SESSION_REFRESHED_EVENT,
  getWorkspaceRole,
  refreshAdminSession,
} from "@/lib/api";
import { authKeys } from "@/services/auth/auth.service";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBranchStore } from "@/stores/branch.store";
import { usePosCartStore } from "@/stores/pos-cart.store";
import { createQueryClient } from "@/lib/query-client";

function AdminSessionLifecycle() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const isLoginPage = pathname === "/oceanicadminlogin" || pathname === "/staff/login";
  const currentUserQuery = useCurrentUser(!isLoginPage);
  const accessExpiresAt = currentUserQuery.data?.accessExpiresAt;

  useEffect(() => {
    const onExpired = () => {
      queryClient.clear();
      usePosCartStore.getState().clearCart();
      useBranchStore.getState().clearSelectedBranch();

      if (window.location.pathname === "/oceanicadminlogin" || window.location.pathname === "/staff/login") return;
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const loginPath = getWorkspaceRole() === "STAFF" ? "/staff/login" : "/oceanicadminlogin";
      router.replace(`${loginPath}?next=${encodeURIComponent(current)}`);
    };

    const onRefreshed = (event: Event) => {
      const expiresAt = (event as CustomEvent<{ accessExpiresAt?: string }>).detail?.accessExpiresAt;
      if (!expiresAt) return;
      queryClient.setQueryData(
        authKeys.currentUser,
        (current: { user: unknown; accessExpiresAt?: string } | undefined) =>
          current ? { ...current, accessExpiresAt: expiresAt } : current,
      );
    };

    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
    window.addEventListener(ADMIN_SESSION_REFRESHED_EVENT, onRefreshed);
    return () => {
      window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, onExpired);
      window.removeEventListener(ADMIN_SESSION_REFRESHED_EVENT, onRefreshed);
    };
  }, [queryClient, router]);

  useEffect(() => {
    if (isLoginPage || !accessExpiresAt) return;
    const expiry = new Date(accessExpiresAt).getTime();
    if (!Number.isFinite(expiry)) return;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let scheduledTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const renew = async () => {
      try {
        await refreshAdminSession();
      } catch {
        // A temporary network or server error should not sign the user out.
        // Retry while the server-side refresh session may still be valid.
        if (!stopped) retryTimer = setTimeout(() => void renew(), 15_000);
      }
    };

    const renewIfNearExpiry = () => {
      if (expiry - Date.now() <= 30_000) void renew();
    };

    scheduledTimer = setTimeout(renewIfNearExpiry, Math.max(0, expiry - Date.now() - 30_000));
    document.addEventListener("visibilitychange", renewIfNearExpiry);

    return () => {
      stopped = true;
      if (scheduledTimer) clearTimeout(scheduledTimer);
      if (retryTimer) clearTimeout(retryTimer);
      document.removeEventListener("visibilitychange", renewIfNearExpiry);
    };
  }, [accessExpiresAt, isLoginPage]);

  return null;
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <Suspense fallback={null}>
        <AdminSessionLifecycle />
      </Suspense>
      {children}
    </QueryClientProvider>
  );
}
