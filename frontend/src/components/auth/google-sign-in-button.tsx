"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { renderGoogleButton, subscribeGoogleCredential } from "@/lib/google-gis";

interface GoogleSignInButtonProps {
  onSuccess: (credential: string) => void;
  onError?: (err: Error) => void;
  text?: "continue_with" | "signin_with" | "signup_with";
  className?: string;
  width?: number | string;
}

export function GoogleSignInButton({
  onSuccess,
  onError,
  text = "continue_with",
  className = "",
  width = 380,
}: GoogleSignInButtonProps) {
  const buttonRef = useRef<HTMLDivElement>(null);
  const [scriptReady, setScriptReady] = useState(() =>
    typeof window !== "undefined" && !!window.google?.accounts?.id
  );
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

  useEffect(() => subscribeGoogleCredential(onSuccess), [onSuccess]);

  const tryRenderButton = useCallback(() => {
    const container = buttonRef.current;
    if (!container || !clientId) return false;
    const preferredWidth = typeof width === "number" ? width : 380;
    const availableWidth = container.clientWidth;
    const buttonWidth = availableWidth > 0
      ? Math.max(200, Math.min(preferredWidth, availableWidth))
      : preferredWidth;
    const rendered = renderGoogleButton(container, clientId, {
      text,
      width: buttonWidth,
      theme: "outline",
    });
    if (!rendered) onError?.(new Error("Google sign-in could not be initialized."));
    return rendered;
  }, [clientId, onError, text, width]);

  useEffect(() => {
    if (!scriptReady || !clientId || !window.google?.accounts?.id) return;
    tryRenderButton();

    const container = buttonRef.current;
    if (!container) return;
    let previousWidth = container.clientWidth;
    const observer = new ResizeObserver((entries) => {
      const nextWidth = Math.round(entries[0]?.contentRect.width ?? 0);
      if (nextWidth > 0 && nextWidth !== previousWidth) {
        previousWidth = nextWidth;
        tryRenderButton();
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [scriptReady, clientId, tryRenderButton]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        // Next.js loads a given script only once. onReady also runs when this
        // route mounts after the root layout has already loaded GIS.
        onReady={() => setScriptReady(true)}
        onError={() => onError?.(new Error("Google sign-in could not be loaded."))}
      />
      {clientId ? (
        <div className={`flex w-full min-w-0 justify-center overflow-hidden ${className}`}>
          <div
            ref={buttonRef}
            className="w-full min-w-0"
            style={{ maxWidth: typeof width === "number" ? width : 380 }}
          />
        </div>
      ) : null}
    </>
  );
}
