"use client";

import { createPortal } from "react-dom";
import { AdminDialogPanel } from "@/components/admin-motion";

type AppErrorModalProps = {
  message: string;
  onClose: () => void;
  title?: string;
};

export function AppErrorModal({ message, onClose, title = "Action could not be completed" }: AppErrorModalProps) {
  if (!message) return null;

  const insufficientStock = message.toLowerCase().includes("insufficient available stock");

  return (
    createPortal(<div
      className="fixed inset-0 z-[110] grid place-items-center overflow-y-auto bg-[#14201e]/55 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <AdminDialogPanel
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="app-error-title"
        aria-describedby="app-error-description"
        onEscape={onClose}
        className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-[#e6eae7] bg-white p-5 shadow-[0_24px_70px_rgba(12,25,25,.28)]"
      >
        <div className="mb-4 grid size-11 place-items-center rounded-full bg-[#fff4e8] text-lg font-semibold text-[#a65c19]" aria-hidden="true">!</div>
        <h2 id="app-error-title" className="m-0 text-lg font-semibold text-[#26372d]">
          {insufficientStock ? "Not enough stock to dispatch" : title}
        </h2>
        <p id="app-error-description" className="mb-0 mt-2 text-sm leading-6 text-[#66746b]">
          {insufficientStock
            ? "The source branch does not have enough available units for this transfer. Check its available stock and reduce the transfer quantity, then try again."
            : message}
        </p>
        <div className="mt-5 flex justify-end">
          <button type="button" autoFocus className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-brand px-5 text-sm font-medium text-white hover:bg-brand-dark" onClick={onClose}>Got it</button>
        </div>
      </AdminDialogPanel>
    </div>, document.body)
  );
}
