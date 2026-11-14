"use client";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string; select_by?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            context?: "signin" | "signup" | "use";
            ux_mode?: "popup" | "redirect";
            itp_support?: boolean;
          }) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              type?: "standard" | "icon";
              theme?: "outline" | "filled_blue" | "filled_black";
              size?: "large" | "medium" | "small";
              text?: "signin_with" | "signup_with" | "continue_with" | "signin";
              shape?: "rectangular" | "pill" | "circle" | "square";
              logo_alignment?: "left" | "center";
              width?: number | string;
              locale?: string;
            }
          ) => void;
          prompt: (momentListener?: (notification: {
            isDisplayed: () => boolean;
            isNotDisplayed: () => boolean;
            getNotDisplayedReason: () => string;
            isSkippedMoment: () => boolean;
            getSkippedReason: () => string;
            isDismissedMoment: () => boolean;
            getDismissedReason: () => string;
            getMomentType: () => string;
          }) => void) => void;
          cancel: () => void;
        };
      };
    };
    __oceanic_gis_initialized?: boolean;
    __oceanic_gis_prompt_in_flight?: boolean;
  }
}

type CredentialCallback = (credential: string) => void | Promise<void>;

const credentialSubscribers = new Set<CredentialCallback>();

export function subscribeGoogleCredential(callback: CredentialCallback): () => void {
  credentialSubscribers.add(callback);
  return () => {
    credentialSubscribers.delete(callback);
  };
}

export function initGoogleGIS(clientId: string): boolean {
  if (typeof window === "undefined" || !window.google?.accounts?.id || !clientId) {
    return false;
  }

  if (window.__oceanic_gis_initialized) {
    return true;
  }

  try {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (response: { credential: string }) => {
        console.log("[Google GIS] Credential received from Google:", !!response?.credential);
        if (response?.credential) {
          credentialSubscribers.forEach((cb) => {
            try {
              cb(response.credential);
            } catch (err) {
              console.error("[Google GIS] Subscriber error:", err);
            }
          });
        }
      },
      auto_select: false,
      cancel_on_tap_outside: false,
      context: "signin",
      itp_support: true,
    });
    window.__oceanic_gis_initialized = true;
    console.log("[Google GIS] Initialized successfully with client:", clientId);
    return true;
  } catch (err) {
    console.warn("[Google GIS] Initialization error:", err);
    return false;
  }
}

export function promptGoogleOneTap(
  clientId: string,
  onPromptResult?: (displayed: boolean, reason?: string) => void
) {
  if (typeof window === "undefined" || !window.google?.accounts?.id || !clientId) {
    return;
  }

  if (!initGoogleGIS(clientId)) {
    return;
  }

  if (window.__oceanic_gis_prompt_in_flight) {
    return;
  }
  window.__oceanic_gis_prompt_in_flight = true;

  try {
    console.log("[Google One Tap] Requesting Google One Tap prompt...");
    window.google.accounts.id.prompt((notification) => {
      window.__oceanic_gis_prompt_in_flight = false;
      if (notification.isDisplayed()) {
        console.log("[Google One Tap] Status: DISPLAYED");
        onPromptResult?.(true);
      } else if (notification.isNotDisplayed()) {
        const reason = notification.getNotDisplayedReason();
        console.warn("[Google One Tap] Status: NOT DISPLAYED. Reason:", reason);
        onPromptResult?.(false, reason);
      } else if (notification.isDismissedMoment()) {
        const reason = notification.getDismissedReason();
        console.log("[Google One Tap] Status: DISMISSED. Reason:", reason);
        onPromptResult?.(false, reason);
      } else if (notification.isSkippedMoment()) {
        const reason = notification.getSkippedReason();
        console.log("[Google One Tap] Status: SKIPPED. Reason:", reason);
        onPromptResult?.(false, reason);
      }
    });
  } catch (err) {
    window.__oceanic_gis_prompt_in_flight = false;
    console.error("[Google One Tap] Prompt call failed:", err);
  }
}

export function renderGoogleButton(
  container: HTMLElement,
  clientId: string,
  options?: {
    text?: "continue_with" | "signin_with" | "signup_with";
    width?: number | string;
    theme?: "outline" | "filled_blue" | "filled_black";
  }
): boolean {
  if (typeof window === "undefined" || !window.google?.accounts?.id || !clientId || !container) {
    return false;
  }

  if (!initGoogleGIS(clientId)) {
    return false;
  }

  try {
    container.innerHTML = "";
    const numericWidth =
      typeof options?.width === "number"
        ? Math.min(Math.max(options.width, 200), 400)
        : 360;

    window.google.accounts.id.renderButton(container, {
      type: "standard",
      theme: options?.theme || "outline",
      size: "large",
      text: options?.text || "continue_with",
      shape: "rectangular",
      logo_alignment: "left",
      width: numericWidth,
    });
    return true;
  } catch (err) {
    console.warn("[Google GIS] renderButton warning:", err);
    return false;
  }
}
