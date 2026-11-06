"use client";

import { useEffect, useRef, type ReactNode, type ComponentProps } from "react";

function playEntrance(element: HTMLElement | null, keyframes: Keyframe[], duration: number) {
  if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  element.animate(keyframes, { duration, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)", fill: "both" });
}

export function AdminPageEntrance({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playEntrance(ref.current, [
      { opacity: 0, transform: "translateY(7px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], 280);
  }, []);

  return <div ref={ref} className={className}>{children}</div>;
}

export function AdminDialogPanel({ className, children, onEscape, ...props }: ComponentProps<"section"> & { onEscape?: () => void }) {
  const ref = useRef<HTMLElement>(null);
  const onEscapeRef = useRef(onEscape);

  useEffect(() => {
    onEscapeRef.current = onEscape;
  }, [onEscape]);

  useEffect(() => {
    playEntrance(ref.current, [
      { opacity: 0, transform: "scale(.965) translateY(5px)" },
      { opacity: 1, transform: "scale(1) translateY(0)" },
    ], 180);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onEscapeRef.current?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return <section ref={ref} className={className} {...props}>{children}</section>;
}
