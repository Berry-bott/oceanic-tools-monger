"use client";

import { createPortal } from "react-dom";
import { AdminDialogPanel } from "@/components/admin-motion";

type AppSuccessModalProps = {
  message: string;
  onClose: () => void;
  title?: string;
};

export function AppSuccessModal({ message, onClose, title = "Success" }: AppSuccessModalProps) {
  if (!message) return null;

  return (
    createPortal(
      <div
        className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-[#14201e]/55 p-4 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <AdminDialogPanel
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-success-title"
          aria-describedby="app-success-description"
          onEscape={onClose}
          className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#e6eae7] bg-white p-5 shadow-[0_24px_70px_rgba(12,25,25,.28)] animate-in fade-in zoom-in-95 duration-150"
        >
          <div
            className="mb-4 grid size-11 place-items-center rounded-full bg-[#ecf7f0] text-[#27794d]"
            aria-hidden="true"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h2 id="app-success-title" className="m-0 text-lg font-semibold text-[#26372d]">
            {title}
          </h2>
          <p id="app-success-description" className="mb-0 mt-2 text-sm leading-6 text-[#66746b]">
            {message}
          </p>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              autoFocus
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-dark transition-colors"
              onClick={onClose}
            >
              Continue
            </button>
          </div>
        </AdminDialogPanel>
      </div>,
      document.body
    )
  );
}
