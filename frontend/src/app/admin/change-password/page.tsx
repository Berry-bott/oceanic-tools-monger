"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { changePassword, signOut } from "@/services/auth/auth.service";

export default function AdminChangePasswordPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  if (currentUser.isPending) {
    return <AdminPageSkeleton variant="form" />;
  }

  const user = currentUser.data?.user;
  if (!user) {
    return (
      <main className="grid min-h-[60vh] place-items-center p-6 text-center">
        <div>
          <h1 className="text-xl font-bold text-[#162721]">Sign in required</h1>
          <p className="mt-2 text-sm text-[#68766e]">Please sign in with your administrator account to change your password.</p>
          <Link href="/oceanicadminlogin" className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark">
            Sign in
          </Link>
        </div>
      </main>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await changePassword({
        currentPassword,
        newPassword,
      });

      setSuccess(true);
      queryClient.clear();

      // Automatically redirect to admin login after 2 seconds
      setTimeout(() => {
        router.replace("/oceanicadminlogin?passwordChanged=1");
      }, 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The password could not be changed. Verify your current password and try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <span className="text-xs font-bold uppercase tracking-wider text-[#718b79]">
          Account Security
        </span>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#162721] sm:text-3xl">
          Change Admin Password
        </h1>
        <p className="mt-2 text-sm text-[#68766e]">
          Update the password for your administrator account ({user.email}). Choose a strong password with at least 12 characters.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        {/* Main Form */}
        <section className="rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
          {success ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-6 text-center">
              <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="mt-3 text-lg font-bold text-emerald-900">Password Changed Successfully!</h2>
              <p className="mt-1 text-sm text-emerald-800">
                Your password has been updated. For your security, active sessions have been revoked. Redirecting to sign in…
              </p>
              <div className="mt-5">
                <Link
                  href="/oceanicadminlogin?passwordChanged=1"
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#286b51] px-5 text-sm font-semibold text-white hover:bg-[#1f5742]"
                >
                  Sign in with new password
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void handleSubmit(e)} className="grid gap-5">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
                  <div className="flex items-center gap-2 font-semibold">
                    <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span>Could not change password</span>
                  </div>
                  <p className="mt-1 text-xs text-red-700">{error}</p>
                </div>
              )}

              {/* Current Password */}
              <div className="grid gap-1.5 text-sm font-medium text-[#34413a]">
                <div className="flex items-center justify-between">
                  <label htmlFor="currentPassword">Current password</label>
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
                    id="currentPassword"
                    name="currentPassword"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    maxLength={200}
                    placeholder="Enter current password"
                    className="h-11 w-full rounded-xl border border-line bg-white pl-3.5 pr-10 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/10"
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

              {/* New Password */}
              <div className="grid gap-1.5 text-sm font-medium text-[#34413a]">
                <div className="flex items-center justify-between">
                  <label htmlFor="newPassword">New password</label>
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
                    id="newPassword"
                    name="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={200}
                    placeholder="Enter at least 12 characters"
                    className="h-11 w-full rounded-xl border border-line bg-white pl-3.5 pr-10 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/10"
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
                <div className="flex items-center gap-2 text-xs">
                  <span className={`inline-block size-2 rounded-full ${newPassword.length >= 12 ? "bg-emerald-500" : "bg-neutral-300"}`} />
                  <span className={newPassword.length >= 12 ? "text-emerald-700 font-medium" : "text-muted"}>
                    {newPassword.length >= 12 ? "Minimum length requirement met" : "Must be at least 12 characters"}
                  </span>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="grid gap-1.5 text-sm font-medium text-[#34413a]">
                <div className="flex items-center justify-between">
                  <label htmlFor="confirmPassword">Confirm new password</label>
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
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    minLength={12}
                    maxLength={200}
                    placeholder="Repeat your new password"
                    className="h-11 w-full rounded-xl border border-line bg-white pl-3.5 pr-10 text-sm outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/10"
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
                {confirmPassword && (
                  <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-block size-2 rounded-full ${newPassword === confirmPassword ? "bg-emerald-500" : "bg-red-400"}`} />
                    <span className={newPassword === confirmPassword ? "text-emerald-700 font-medium" : "text-red-600 font-medium"}>
                      {newPassword === confirmPassword ? "Passwords match" : "Passwords do not match"}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2 flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-11 items-center justify-center rounded-xl bg-brand px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60"
                >
                  {submitting ? "Updating password…" : "Update password"}
                </button>
                <Link
                  href="/admin/settings"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-line bg-white px-5 text-sm font-semibold text-[#536159] transition-colors hover:bg-[#f8faf8]"
                >
                  Cancel
                </Link>
              </div>
            </form>
          )}
        </section>

        {/* Security Info Card */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-line bg-white p-6 shadow-sm">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[#162721]">
              <svg className="size-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Password Guidelines
            </h3>
            <ul className="mt-3 space-y-2 text-xs leading-5 text-[#68766e]">
              <li className="flex items-start gap-2">
                <span className="font-bold text-brand">•</span>
                <span>Minimum 12 characters in length</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-brand">•</span>
                <span>Combine uppercase letters, lowercase letters, numbers, and symbols</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-brand">•</span>
                <span>Avoid simple sequences or dictionary words</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="font-bold text-brand">•</span>
                <span>Changing your password will sign you out on other devices</span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-[#dcebe0] bg-[#f2f8f4] p-5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#1e6146]">Owner Access</h4>
            <p className="mt-1 text-xs leading-5 text-[#355f4d]">
              As an administrator, your password grants full control over products, finances, customer orders, and staff permissions.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
