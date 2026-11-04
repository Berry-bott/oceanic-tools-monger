export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api/v1"
).replace(/\/$/, "");

export const ADMIN_SESSION_EXPIRED_EVENT = "oceanic:admin-session-expired";
export const ADMIN_SESSION_REFRESHED_EVENT = "oceanic:admin-session-refreshed";
const WORKSPACE_STORAGE_KEY = "oceanic.workspace-role";
export type WorkspaceRole = "OWNER" | "STAFF";

/** The role selector is kept per browser tab; the server still verifies it against the session. */
export function getWorkspaceRole(): WorkspaceRole {
  if (typeof window === "undefined") return "OWNER";
  const path = window.location.pathname;
  if (path === "/staff/login" || path.startsWith("/staff/")) return "STAFF";
  if (path === "/oceanicadminlogin") return "OWNER";
  try {
    const saved = window.sessionStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (saved === "OWNER" || saved === "STAFF") return saved;
  } catch {
    // Storage can be disabled; route-based selection still works for sign-in pages.
  }
  return "OWNER";
}

export function setWorkspaceRole(role: WorkspaceRole) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WORKSPACE_STORAGE_KEY, role);
  } catch {
    // The server independently validates role and session on every request.
  }
}

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  requestId?: string;

  constructor(message: string, status: number, options?: { code?: string; requestId?: string }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}

type RefreshResponse = { accessExpiresAt: string };
type NavigatorWithLocks = {
  locks?: { request(name: string, callback: () => Promise<boolean>): Promise<boolean> };
};

const refreshInFlight = new Map<WorkspaceRole, Promise<boolean>>();

function publishSessionEvent(name: string, detail?: RefreshResponse) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

async function requestRefresh(): Promise<boolean> {
  const workspaceRole = getWorkspaceRole();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      headers: { "X-Oceanic-Workspace": workspaceRole },
    });

    if (response.status === 409) {
      const payload = await response.json().catch(() => null) as
        | { error?: { code?: string; message?: string } }
        | null;
      if (payload?.error?.code === "SESSION_REFRESH_IN_PROGRESS" && attempt < 4) {
        const retryAfter = Number(response.headers.get("retry-after")) || 1;
        await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfter, 2) * 1000));
        continue;
      }
      throw new ApiRequestError(
        payload?.error?.message || `Session refresh failed (${response.status}).`,
        response.status,
      );
    }

    if (response.status === 401) {
      publishSessionEvent(ADMIN_SESSION_EXPIRED_EVENT);
      return false;
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as
        | { error?: { message?: string } }
        | null;
      throw new ApiRequestError(
        payload?.error?.message || `Session refresh failed (${response.status}).`,
        response.status,
      );
    }

    const payload = await response.json() as RefreshResponse;
    publishSessionEvent(ADMIN_SESSION_REFRESHED_EVENT, payload);
    return true;
  }

  return false;
}

/** Refresh the administrator session once, coordinating simultaneous requests across tabs. */
export function refreshAdminSession(): Promise<boolean> {
  const workspaceRole = getWorkspaceRole();
  const inFlight = refreshInFlight.get(workspaceRole);
  if (inFlight) return inFlight;

  const locks = typeof navigator === "undefined"
    ? undefined
    : (navigator as unknown as NavigatorWithLocks).locks;
  const refresh = () => locks
    ? locks.request(`oceanic-session-refresh-${workspaceRole.toLowerCase()}`, requestRefresh)
    : requestRefresh();

  const running = refresh();
  const tracked = running.finally(() => {
    refreshInFlight.delete(workspaceRole);
  });
  refreshInFlight.set(workspaceRole, tracked);
  return tracked;
}

function canRefreshForPath(path: string) {
  return !(
    path.startsWith("/auth/login") ||
    path.startsWith("/auth/refresh") ||
    path.startsWith("/auth/logout") ||
    path.startsWith("/customer-account/")
  );
}

async function isExpiredSessionResponse(response: Response) {
  const payload = await response.clone().json().catch(() => null) as
    | { error?: { code?: string } }
    | null;
  return payload?.error?.code === "SESSION_EXPIRED" ||
    payload?.error?.code === "UNAUTHENTICATED";
}

async function fetchWithSession(path: string, init: RequestInit = {}) {
  const url = `${API_BASE_URL}${path}`;
  const workspaceRole = getWorkspaceRole();
  const headers = {
    ...(init.body && !(typeof FormData !== "undefined" && init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...init.headers,
    "X-Oceanic-Workspace": workspaceRole,
  };
  const response = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers,
  });

  if (
    response.status !== 401 ||
    !canRefreshForPath(path) ||
    !(await isExpiredSessionResponse(response))
  ) return response;

  if (!(await refreshAdminSession())) return response;

  // Retry the original call once. A second 401 is returned to the caller and
  // never causes an unbounded refresh loop.
  const retriedResponse = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers,
  });
  if (
    retriedResponse.status === 401 &&
    await isExpiredSessionResponse(retriedResponse)
  ) publishSessionEvent(ADMIN_SESSION_EXPIRED_EVENT);
  return retriedResponse;
}

async function throwApiError(response: Response, action: string): Promise<never> {
  const payload = await response.json().catch(() => null) as
    | { error?: { code?: string; message?: string; requestId?: string } }
    | null;
  throw new ApiRequestError(
    payload?.error?.message || `${action} failed (${response.status}).`,
    response.status,
    { code: payload?.error?.code, requestId: payload?.error?.requestId },
  );
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetchWithSession(path, init);
  if (!response.ok) return throwApiError(response, "Request");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename?: string }> {
  const response = await fetchWithSession(path);
  if (!response.ok) return throwApiError(response, "Download");

  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedFilename = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const plainFilename = disposition.match(/filename="?([^";]+)"?/i)?.[1];
  const filename = encodedFilename
    ? decodeURIComponent(encodedFilename)
    : plainFilename;

  return { blob: await response.blob(), filename };
}
