"use client";

import { useToastStore } from "@/stores/toast.store";
import { useStoreCart } from "@/stores/store-cart.store";

export function ToastContainer() {
  const { toasts, removeToast } = useToastStore();
  const setDrawerOpen = useStoreCart((s) => s.setDrawerOpen);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="fixed bottom-20 right-4 z-[120] flex flex-col gap-2 pointer-events-none sm:bottom-6 sm:right-6 max-w-sm w-full"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-[#dfe8e2] bg-white p-3.5 shadow-[0_12px_32px_rgba(20,36,28,0.16)] transition-all animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          {toast.imageUrl ? (
            <img
              src={toast.imageUrl}
              alt=""
              className="size-12 rounded-xl object-cover border border-[#edf2ee] shrink-0 bg-[#f7faf8]"
            />
          ) : (
            <div className="grid size-10 place-items-center rounded-xl bg-[#ecf7f0] text-[#27794d] shrink-0">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#2f855a]">
                {toast.title || "Added to Cart"}
              </span>
            </div>
            <p className="m-0 truncate text-xs font-semibold text-[#1e2e25] leading-snug">
              {toast.message}
            </p>
            {toast.price != null && (
              <span className="text-xs font-bold text-[#14231b]">
                ₦{toast.price.toLocaleString("en-NG")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              removeToast(toast.id);
              setDrawerOpen(true);
            }}
            className="shrink-0 rounded-lg bg-[#192b22] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-peach-dark transition-colors"
          >
            View Cart
          </button>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="grid size-6 place-items-center rounded-md text-[#88988e] hover:bg-[#f1f6f2] hover:text-[#22352a] shrink-0 text-base"
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
