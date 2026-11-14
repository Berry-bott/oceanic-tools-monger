"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";
import { useCustomerAuth } from "@/stores/customer-auth.store";
import {
  subscribeGoogleCredential,
  promptGoogleOneTap,
} from "@/lib/google-gis";

export function GoogleOneTap() {
  const pathname = usePathname();
  const { isAuthenticated, checkSession, loginWithGoogle } = useCustomerAuth();
  const [scriptLoaded, setScriptLoaded] = useState(() => {
    return typeof window !== "undefined" && !!window.google?.accounts?.id;
  });

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || "";

  // Do not trigger on /account (it is already the dedicated login center),
  // nor on administrative or staff internal portals
  const isExcludedPage =
    pathname.startsWith("/account") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/staff") ||
    pathname.startsWith("/oceanicadminlogin");

  // Re-verify existing session once on mount if store believes user is authenticated
  useEffect(() => {
    if (isAuthenticated) {
      checkSession();
    }
  }, [isAuthenticated, checkSession]);

  // Subscribe to Google credentials received from GIS
  useEffect(() => {
    const unsubscribe = subscribeGoogleCredential(async (credential) => {
      try {
        await loginWithGoogle(credential);
      } catch (err) {
        console.error("[Google One Tap] Login failed:", err);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [loginWithGoogle]);

  // Check if window.google is already on window
  useEffect(() => {
    if (typeof window !== "undefined" && window.google?.accounts?.id) {
      setScriptLoaded(true);
    }
  }, []);

  // Trigger native Google One Tap popup ONLY on public browsing pages (NOT on /account)
  useEffect(() => {
    if (
      !scriptLoaded ||
      isAuthenticated ||
      isExcludedPage ||
      !clientId
    ) {
      // If user navigates onto /account, cancel any active One Tap prompt
      if (isExcludedPage && typeof window !== "undefined" && window.google?.accounts?.id?.cancel) {
        window.google.accounts.id.cancel();
      }
      return;
    }

    // Call native GIS prompt
    promptGoogleOneTap(clientId);
  }, [scriptLoaded, isAuthenticated, isExcludedPage, clientId, pathname]);

  return (
    <Script
      src="https://accounts.google.com/gsi/client"
      strategy="afterInteractive"
      onLoad={() => setScriptLoaded(true)}
    />
  );
}
