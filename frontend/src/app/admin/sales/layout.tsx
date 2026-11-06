import type { ReactNode } from "react";

// The sales workspace is client-rendered and depends on session and network
// state, so opt it out of instant-navigation render validation.
export const instant = false;

export default function SalesLayout({ children }: { children: ReactNode }) {
  return children;
}
