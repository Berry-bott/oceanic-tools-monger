"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePosCartStore } from "@/stores/pos-cart.store";
import { useBranchStore } from "@/stores/branch.store";
import { signInUser } from "@/services/auth/auth.service";
import { setWorkspaceRole } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isStaffLogin = pathname === "/staff/login";
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hadCredentials = url.searchParams.has("email") || url.searchParams.has("password");
    if (!hadCredentials) return;
    url.searchParams.delete("email");
    url.searchParams.delete("password");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const passwordInput = document.querySelector<HTMLInputElement>('input[name="password"]');
    if (passwordInput) passwordInput.value = "";
  }, []);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(event.currentTarget);

    try {
      const session = await signInUser({
        email: form.get("email"),
        password: form.get("password"),
      });
      setWorkspaceRole(session.user.role === "STAFF" ? "STAFF" : "OWNER");
      // A browser session may switch businesses or user accounts. Clear cached
      // server data before the next admin route fetches under the new cookie.
      queryClient.clear();
      usePosCartStore.getState().clearCart();
      useBranchStore.getState().clearSelectedBranch();

      const next = new URLSearchParams(window.location.search).get("next");
      const destination = next
        ? new URL(next, window.location.origin)
        : new URL(session.user.role === "STAFF" ? "/staff/dashboard" : "/admin", window.location.origin);

      router.replace(
        destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : "/admin",
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Sign-in failed. Try again.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-[#f7f9f8] lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative min-h-[300px] overflow-hidden bg-[#102423] sm:min-h-[380px] lg:min-h-screen">
        <Image
          src="/workshop-drill.jpg"
          alt="A worker using a cordless hand drill in a workshop"
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 55vw"
          className="object-cover object-center opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071817]/90 via-[#0c2422]/35 to-[#0c2422]/10" />
        <div className="relative flex min-h-[300px] flex-col justify-between p-6 text-white sm:min-h-[380px] sm:p-10 lg:min-h-screen lg:p-14">
          <Link className="flex w-fit items-center gap-3" href="/admin" aria-label="OceanicToolsMonger home">
            <span className="grid size-10 place-items-center rounded-xl bg-[#149e8f] text-lg font-extrabold text-white">O</span>
            <span className="text-lg font-extrabold tracking-tight">OceanicToolsMonger</span>
          </Link>
          <div className="max-w-xl pb-2 sm:pb-6 lg:pb-10">
            <span className="mb-4 inline-flex rounded-full border border-white/30 bg-black/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-white/90">
              Your business, in one place
            </span>
            <h1 className="max-w-lg text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Tools for the work ahead.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-white/80 sm:text-base">
              Keep stock, sales and business money organised from one simple workspace.
            </p>
          </div>
          <p className="hidden text-xs text-white/70 lg:block">OceanicToolsMonger business workspace</p>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 sm:px-8 lg:px-12">
        <div className="w-full max-w-md rounded-2xl border border-[#e7e9eb] bg-white p-6 shadow-sm sm:p-9">
          <div className="mb-8 lg:hidden">
            <Link className="flex w-fit items-center gap-2.5 text-[#1d3129]" href="/admin">
              <span className="grid size-9 place-items-center rounded-xl bg-[#149e8f] font-extrabold text-white">O</span>
              <span className="text-base font-extrabold tracking-tight">OceanicToolsMonger</span>
            </Link>
          </div>
          <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-[#108578]">{isStaffLogin ? "Staff workspace" : "Business operations"}</p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-[#172720]">{isStaffLogin ? "Staff sign in" : "Welcome back"}</h2>
          <p className="mt-2 text-sm leading-6 text-[#68766e]">{isStaffLogin ? "Sign in to open your work dashboard." : "Sign in to manage stock, sales and money."}</p>

          <form method="post" action={isStaffLogin ? "/staff/login" : "/oceanicadminlogin"} className="mt-8 grid gap-5" onSubmit={(event) => void signIn(event)}>
            <label className="grid gap-2 text-sm font-bold text-[#34413a]">
              Email address
              <input
                className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="you@business.com"
                required
                maxLength={254}
              />
            </label>
            <label className="grid gap-2 text-sm font-bold text-[#34413a]">
              Password
              <input
                className="h-11 rounded-xl border border-[#dfe6e0] bg-white px-3 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={200}
              />
            </label>
            {error && <p className="m-0 text-sm leading-6 text-[#b44f44]" role="alert">{error}</p>}
            <button
              className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl border border-[#149e8f] bg-[#149e8f] px-4 text-sm font-extrabold text-white transition-colors hover:bg-[#108578] disabled:cursor-wait disabled:opacity-60"
              type="submit"
              disabled={loading}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
          <p className="mt-6 text-center text-xs text-[#7b887f]">Your account is protected.</p>
        </div>
      </section>
    </main>
  );
}
