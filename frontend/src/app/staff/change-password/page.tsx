"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { changePassword } from "@/services/auth/auth.service";
import { setWorkspaceRole } from "@/lib/api";

export default function StaffChangePasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const newPassword = String(form.get("newPassword") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      setSubmitting(false);
      return;
    }

    try {
      await changePassword({
        currentPassword: String(form.get("currentPassword") ?? ""),
        newPassword,
      });
      queryClient.clear();
      setWorkspaceRole("STAFF");
      router.replace("/staff/login?passwordChanged=1");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be changed. Try again.");
      setSubmitting(false);
    }
  }

  if (currentUser.isPending) return <AdminPageSkeleton />;
  if (currentUser.data?.user.role !== "STAFF") {
    return (
      <main className="grid min-h-screen place-items-center p-6 text-center">
        <section>
          <h1 className="text-xl font-semibold">Staff password page</h1>
          <p className="text-sm text-muted">Sign in with a staff account to change its password.</p>
          <Link className="text-sm font-semibold text-brand underline" href="/staff/login">
            Go to staff sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9f8] px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-brand">Staff account setup</p>
        <h1 className="mb-0 mt-3 text-2xl font-bold text-ink">Choose your password</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-muted">
          Your administrator gave you a temporary password. Change it now before using the workspace. Choose at least 12 characters. You’ll need to sign in again after saving.
        </p>
        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
            {error}
          </p>
        )}
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <div className="grid gap-1.5 text-sm font-medium text-[#536159]">
            <div className="flex items-center justify-between">
              <span>Temporary password</span>
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="text-xs font-semibold text-brand hover:text-brand-dark"
              >
                {showCurrentPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                autoFocus
                className="h-11 w-full rounded-lg border border-line pl-3 pr-10 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                name="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                maxLength={200}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute right-3 p-1 text-[#7b887f] hover:text-[#34413a]"
                aria-label={showCurrentPassword ? "Hide password" : "Show password"}
              >
                {showCurrentPassword ? (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-1.5 text-sm font-medium text-[#536159]">
            <div className="flex items-center justify-between">
              <span>New password</span>
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="text-xs font-semibold text-brand hover:text-brand-dark"
              >
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                className="h-11 w-full rounded-lg border border-line pl-3 pr-10 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                name="newPassword"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute right-3 p-1 text-[#7b887f] hover:text-[#34413a]"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
              >
                {showNewPassword ? (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="grid gap-1.5 text-sm font-medium text-[#536159]">
            <div className="flex items-center justify-between">
              <span>Confirm new password</span>
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="text-xs font-semibold text-brand hover:text-brand-dark"
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="relative flex items-center">
              <input
                className="h-11 w-full rounded-lg border border-line pl-3 pr-10 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/10"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={200}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute right-3 p-1 text-[#7b887f] hover:text-[#34413a]"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                  </svg>
                ) : (
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? "Changing password…" : "Change password"}
          </button>
        </form>
      </section>
    </main>
  );
}
