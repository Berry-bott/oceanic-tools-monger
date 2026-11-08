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
    return <main className="grid min-h-screen place-items-center p-6 text-center"><section><h1 className="text-xl font-semibold">Staff password page</h1><p className="text-sm text-muted">Sign in with a staff account to change its password.</p><Link className="text-sm font-semibold text-brand underline" href="/staff/login">Go to staff sign in</Link></section></main>;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#f7f9f8] px-4 py-8">
      <section className="w-full max-w-md rounded-2xl border border-line bg-white p-6 shadow-sm sm:p-8">
        <p className="m-0 text-xs font-bold uppercase tracking-[.14em] text-brand">Staff account setup</p>
        <h1 className="mb-0 mt-3 text-2xl font-bold text-ink">Choose your password</h1>
        <p className="mb-6 mt-2 text-sm leading-6 text-muted">Your administrator gave you a temporary password. Change it now before using the workspace. Choose at least 12 characters. You’ll need to sign in again after saving.</p>
        {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
        <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
          <label className="grid gap-1.5 text-sm font-medium text-[#536159]">Temporary password<input autoFocus className="h-11 rounded-lg border border-line px-3 text-sm" name="currentPassword" type="password" autoComplete="current-password" required maxLength={200} /></label>
          <label className="grid gap-1.5 text-sm font-medium text-[#536159]">New password<input className="h-11 rounded-lg border border-line px-3 text-sm" name="newPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={200} /></label>
          <label className="grid gap-1.5 text-sm font-medium text-[#536159]">Confirm new password<input className="h-11 rounded-lg border border-line px-3 text-sm" name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={200} /></label>
          <button type="submit" disabled={submitting} className="mt-1 h-11 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">{submitting ? "Changing password…" : "Change password"}</button>
        </form>
      </section>
    </main>
  );
}
