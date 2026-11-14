"use client";

import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys, signInUser } from "@/services/auth/auth.service";
import { setWorkspaceRole } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const pathname = usePathname();
  const isStaffLogin = pathname === "/staff/login";
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

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
      queryClient.setQueryData(authKeys.currentUser, session);

      if (session.user.role === "STAFF" && session.user.mustChangePassword) {
        router.replace("/staff/change-password");
        return;
      }

      const next = new URLSearchParams(window.location.search).get("next");
      const destination = next && next.startsWith("/")
        ? new URL(next, window.location.origin)
        : new URL(session.user.role === "STAFF" ? "/admin/sales" : "/admin", window.location.origin);

      router.replace(
        destination.origin === window.location.origin
          ? `${destination.pathname}${destination.search}${destination.hash}`
          : session.user.role === "STAFF" ? "/admin/sales" : "/admin",
      );
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Sign in failed";
      setError(
        message === "INVALID_CREDENTIALS"
          ? isStaffLogin
            ? "Check your email and password, or ask your administrator to verify your staff account."
            : "Check your email and password, or use your owner recovery credentials."
          : message === "INACTIVE_ACCOUNT"
            ? "This account has been deactivated. Contact the business owner."
            : message === "FORBIDDEN_WORKSPACE"
              ? isStaffLogin
                ? "This account does not have staff permissions."
                : "This account cannot access the owner workspace."
              : message,
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f3f6f4] lg:place-items-stretch lg:grid-cols-[0.9fr_1.1fr]">
      <section className="relative hidden overflow-hidden lg:order-1 lg:block lg:min-h-screen">
        <Image
          src="/construction-worker.jpg"
          alt="Construction worker using a hammer on a building site"
          fill
          priority
          sizes="(max-width: 1023px) 100vw, 55vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1715ed] via-[#10241e75] to-[#10241e12]" />
        <div className="absolute inset-x-0 bottom-0 max-w-3xl p-8 text-white xl:p-14">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-[#10241e66] px-4 py-2 text-xs font-semibold tracking-wide text-white shadow-lg backdrop-blur-md">
            {isStaffLogin ? "Oceanic Tools Monger · Team" : "Oceanic Tools Monger · Business"}
          </span>
          <h1 className="mt-6 max-w-2xl text-4xl font-extrabold leading-[1.08] tracking-tight xl:text-5xl">
            {isStaffLogin ? "Staff POS & Store Operations" : "Business Management & Operations"}
          </h1>
          <p className="mb-0 mt-5 max-w-xl text-base leading-7 text-white/90">
            {isStaffLogin
              ? "Access point of sale, manage customer sales, verify inventory and process receipts."
              : "Keep stock, sales and business money organised from one simple workspace."}
          </p>
        </div>
      </section>

      <section className="order-2 grid w-full place-items-center p-4 sm:p-10 lg:order-2">
        <div className="w-full max-w-md rounded-2xl border border-[#dfe6e0] bg-white p-6 shadow-[0_20px_60px_rgba(18,38,30,0.06)] sm:p-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#dcebe0] bg-[#eef7f2] px-3 py-1 text-xs font-bold text-[#1f6b53]">
            {isStaffLogin ? "Staff Portal" : "Admin Portal"}
          </span>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[#162721]">
            {isStaffLogin ? "Staff Sign In" : "Admin Sign In"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-[#68766e]">
            {isStaffLogin ? "Sign in to start selling." : "Sign in to manage stock, sales and money."}
          </p>

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

            <div className="grid gap-2 text-sm font-bold text-[#34413a]">
              <div className="flex items-center justify-between">
                <span>Password</span>
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-xs font-semibold text-[#149e8f] hover:text-[#108578] focus:outline-none"
                >
                  {showPassword ? "Hide password" : "Show password"}
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  className="h-11 w-full rounded-xl border border-[#dfe6e0] bg-white pl-3 pr-10 text-sm font-normal text-[#172720] outline-none placeholder:text-[#9aa49d] focus:border-[#149e8f] focus:ring-4 focus:ring-[#149e8f]/10"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  maxLength={200}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 p-1 text-[#7b887f] hover:text-[#34413a]"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

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
