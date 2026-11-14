import Link from "next/link";
import { API_BASE_URL } from "@/lib/api";

export default async function VerifyCustomerEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; store?: string }>;
}) {
  const { token, store } = await searchParams;
  let message = "The verification link is incomplete. Request a new verification email from the store.";
  let verified = false;

  if (token && store) {
    try {
      const response = await fetch(
        `${API_BASE_URL}/customer-account/verify-email?store=${encodeURIComponent(store)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
          cache: "no-store",
        },
      );
      const payload = await response.json().catch(() => null);
      verified = response.ok;
      message = response.ok
        ? "Your email is verified. Sign in to your customer account to review products you have purchased."
        : payload?.error?.message || "This verification link is invalid or expired. Request a new one from the store.";
    } catch {
      message = "We could not verify your email right now. Please try the link again shortly.";
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10 text-charcoal">
      <section className="w-full max-w-lg rounded-2xl border border-peach-light bg-white p-7 text-center shadow-sm">
        <h1 className="m-0 font-display text-2xl font-bold">{verified ? "Email verified" : "Email verification"}</h1>
        <p className="mb-6 mt-3 text-sm leading-relaxed text-charcoal-light">{message}</p>
        <Link href={store ? `/store/${encodeURIComponent(store)}` : "/store"} className="inline-flex rounded-lg bg-peach-dark px-5 py-3 text-sm font-semibold text-white">
          Return to store
        </Link>
      </section>
    </main>
  );
}
