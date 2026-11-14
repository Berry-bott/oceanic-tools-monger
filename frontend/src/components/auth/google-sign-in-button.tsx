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
  const [scriptReady, setScriptReady] = useState(false);
  const [isGisRendered, setIsGisRendered] = useState(false);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

  useEffect(() => subscribeGoogleCredential(onSuccess), [onSuccess]);

  const tryRenderButton = useCallback(() => {
    if (!buttonRef.current || !clientId) return false;
    const rendered = renderGoogleButton(buttonRef.current, clientId, {
      text,
      width,
      theme: "outline",
    });
    setIsGisRendered(rendered);
    if (!rendered) onError?.(new Error("Google sign-in could not be initialized."));
    return rendered;
  }, [clientId, onError, text, width]);

  useEffect(() => {
    if (scriptReady && clientId && window.google?.accounts?.id) tryRenderButton();
  }, [scriptReady, clientId, tryRenderButton]);

  return (
    <>
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
        onError={() => onError?.(new Error("Google sign-in could not be loaded."))}
      />
      {clientId ? (
        <div className={`w-full flex justify-center ${className}`}>
          <div
            ref={buttonRef}
            className={isGisRendered ? "w-full flex justify-center" : "hidden"}
            style={{ maxWidth: typeof width === "number" ? width : 380 }}
          />
        </div>
      ) : null}
    </>
  );
}
