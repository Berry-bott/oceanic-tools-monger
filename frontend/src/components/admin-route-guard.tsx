"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/queries/use-current-user";

const adminRoles = new Set(["OWNER", "STAFF"]);
function hasRouteAccess(user: { role: string; staffAccessRole?: string | null }, pathname: string) {
  if (user.role === "OWNER") return true;
  if (user.role !== "STAFF") return false;
  if (pathname === "/staff/change-password") return true;
  if (pathname === "/admin" || pathname === "/staff/dashboard") return false;
  const staffRoutes = ["/admin/customers", "/admin/notes"];
  const seniorRoutes = ["/admin/sales/installments", "/admin/sales/returns", "/admin/products", "/admin/inventory", "/admin/purchasing", "/admin/orders", "/admin/creditors"];
  return pathname === "/admin/sales" || staffRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)) || (user.staffAccessRole === "SENIOR_STAFF" && seniorRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`)));
}

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/oceanicadminlogin" || pathname === "/staff/login";
  const isPublicStoreRoute =
    pathname === "/" ||
    pathname === "/store" ||
    pathname.startsWith("/store/") ||
    pathname === "/checkout" ||
    pathname.startsWith("/checkout/") ||
    pathname === "/order-confirmation" ||
    pathname.startsWith("/order-confirmation/");
  const isExemptRoute = isLoginPage || isPublicStoreRoute;
  const currentUserQuery = useCurrentUser(!isExemptRoute);
  const passwordRouteMismatch = currentUserQuery.data?.user.role === "STAFF" &&
    (currentUserQuery.data.user.mustChangePassword
      ? pathname !== "/staff/change-password"
      : pathname === "/staff/change-password");
  const errorStatus = currentUserQuery.error && "status" in currentUserQuery.error
    ? Number(currentUserQuery.error.status)
    : undefined;
  const state = isExemptRoute
    ? "allowed"
    : passwordRouteMismatch
      ? "checking"
      : currentUserQuery.data
        ? !adminRoles.has(currentUserQuery.data.user.role)
          ? "blocked"
          : currentUserQuery.data.user.role === "STAFF" && !hasRouteAccess(currentUserQuery.data.user, pathname)
            ? "checking"
            : "allowed"
        : currentUserQuery.error
          ? errorStatus === 401
            ? "checking"
            : errorStatus !== undefined && errorStatus >= 500
              ? "server-error"
              : "offline"
          : "checking";
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (isExemptRoute || currentUserQuery.isPending) return;

    if (currentUserQuery.data) {
      const currentUser = currentUserQuery.data.user;
      if (currentUser.role === "STAFF" && currentUser.mustChangePassword && pathname !== "/staff/change-password") {
        router.replace("/staff/change-password");
        return;
      }
      if (currentUser.role === "STAFF" && !currentUser.mustChangePassword && pathname === "/staff/change-password") {
        router.replace("/admin/sales");
        return;
      }
      if (currentUser.role === "STAFF" && !hasRouteAccess(currentUser, pathname)) {
        router.replace("/admin/sales");
        return;
      }
      return;
    }

    if (currentUserQuery.error) {
      if (
        currentUserQuery.error instanceof Error &&
        "status" in currentUserQuery.error &&
        currentUserQuery.error.status === 401
      ) {
        const current = `${window.location.pathname}${window.location.search}`;
        router.replace(
          `${pathname.startsWith("/staff") ? "/staff/login" : "/oceanicadminlogin"}?next=${encodeURIComponent(current)}`,
        );
        return;
      }
    }
  }, [currentUserQuery.data, currentUserQuery.error, currentUserQuery.isPending, isLoginPage, pathname, retry, router]);

  if (isExemptRoute || state === "allowed") return children;

  if (state === "blocked") {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
        <section className="max-w-md">
          <h1 className="text-xl font-bold">You do not have access</h1>
          <p className="mt-2 text-sm text-muted">
            Ask your business owner to give this account access to the admin
            dashboard.
          </p>
          <button
            className="mt-5 rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold"
            onClick={() => router.replace("/oceanicadminlogin")}
          >
            Sign in with another account
          </button>
        </section>
      </main>
    );
  }

  if (state === "offline" || state === "server-error") {
    const serverError = state === "server-error";
    const requestIdValue = currentUserQuery.error && "requestId" in currentUserQuery.error
      ? currentUserQuery.error.requestId
      : undefined;
    const requestId = typeof requestIdValue === "string" ? requestIdValue : undefined;
    return (
      <main className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground">
        <section className="max-w-md">
          <h1 className="text-xl font-bold">{serverError ? "The server had a problem" : "Cannot reach the server"}</h1>
          <p className="mt-2 text-sm text-muted">
            {serverError
              ? "Your sign-in is still saved. Please try again shortly."
              : "Check your internet connection. Your sign-in is still saved."}
          </p>
          {requestId && <p className="mt-2 text-xs text-muted">Error reference: {requestId}</p>}
          <button
            className="mt-5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              setRetry((value) => value + 1);
              void currentUserQuery.refetch();
            }}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  return (
    <main
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-background text-sm text-muted"
    >
      Checking your sign-in...
    </main>
  );
}
