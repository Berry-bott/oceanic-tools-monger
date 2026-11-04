"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/hooks/queries/use-current-user";

type GateState = "checking" | "allowed" | "offline" | "server-error" | "blocked";

const adminRoles = new Set(["OWNER", "STAFF"]);

export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/oceanicadminlogin" || pathname === "/staff/login";
  const currentUserQuery = useCurrentUser(!isLoginPage);
  const [gate, setGate] = useState<{ pathname: string; state: GateState }>({
    pathname,
    state: isLoginPage ? "allowed" : "checking",
  });
  const state = isLoginPage
    ? "allowed"
    : gate.pathname === pathname
      ? gate.state
      : currentUserQuery.data
        ? adminRoles.has(currentUserQuery.data.user.role)
          ? "allowed"
          : "blocked"
        : "checking";
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (isLoginPage || currentUserQuery.isPending) return;

    if (currentUserQuery.data) {
      if (currentUserQuery.data.user.role === "STAFF" && pathname === "/admin") {
        router.replace("/staff/dashboard");
      }
      setGate({
        pathname,
        state: adminRoles.has(currentUserQuery.data.user.role)
          ? "allowed"
          : "blocked",
      });
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
      const status = "status" in currentUserQuery.error
        ? Number(currentUserQuery.error.status)
        : undefined;
      setGate({ pathname, state: status !== undefined && status >= 500 ? "server-error" : "offline" });
    }
  }, [currentUserQuery.data, currentUserQuery.error, currentUserQuery.isPending, isLoginPage, pathname, retry, router]);

  if (isLoginPage || state === "allowed") return children;

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
          <h1 className="text-xl font-bold">{serverError ? "The server had a problem" : "Can&apos;t reach the server"}</h1>
          <p className="mt-2 text-sm text-muted">
            {serverError
              ? "Your sign-in is still saved. Please try again shortly."
              : "Check your internet connection. Your sign-in is still saved."}
          </p>
          {requestId && <p className="mt-2 text-xs text-muted">Error reference: {requestId}</p>}
          <button
            className="mt-5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              setGate({ pathname, state: "checking" });
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
