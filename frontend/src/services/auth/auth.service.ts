import { apiRequest } from "@/lib/api";

export type CurrentUser = {
  id: string;
  businessId: string;
  name?: string;
  email?: string;
  role: string;
  staffAccessRole?: "CASHIER" | "SENIOR_STAFF" | null;
  mustChangePassword?: boolean;
  branchId?: string | null;
};

export type CurrentUserSession = {
  user: CurrentUser;
  accessExpiresAt: string;
};

export const authKeys = { currentUser: ["auth", "current-user"] as const };

export function getCurrentUser() {
  return apiRequest<CurrentUserSession>("/auth/me", {
    signal: AbortSignal.timeout(15_000),
  });
}

export function signOut() {
  return apiRequest<void>("/auth/refresh/logout", {
    method: "POST",
    signal: AbortSignal.timeout(5_000),
  });
}

export function signInUser(input: { email: FormDataEntryValue | null; password: FormDataEntryValue | null }) {
  return apiRequest<CurrentUserSession>("/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return apiRequest<void>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
