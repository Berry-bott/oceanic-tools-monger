import { create } from "zustand";
import { persist } from "zustand/middleware";
import { customerAccountService, type CustomerProfile } from "@/services/customer/customer-account.service";

export interface CustomerAuthState {
  customer: CustomerProfile | null;
  email: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  // Actions
  checkSession: () => Promise<boolean>;
  login: (payload: { email: string; password: string }) => Promise<void>;
  register: (payload: { name: string; email: string; phone?: string; password: string }) => Promise<boolean>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (payload: { name?: string; phone?: string; address?: string; avatarUrl?: string | null }) => Promise<void>;
  updateAvatar: (avatarUrl: string) => Promise<void>;
  clearError: () => void;
}

export const useCustomerAuth = create<CustomerAuthState>()(
  persist(
    (set, get) => ({
      customer: null,
      email: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      checkSession: async () => {
        try {
          const res = await customerAccountService.getMe();
          if (res?.customer) {
            set((state) => ({
              customer: {
                ...res.customer,
                avatarUrl: res.customer.avatarUrl ?? state.customer?.avatarUrl ?? null,
              },
              email: res.email,
              isAuthenticated: true,
              error: null,
            }));
            return true;
          } else {
            set({
              customer: null,
              email: null,
              isAuthenticated: false,
            });
            return false;
          }
        } catch {
          set({ customer: null, email: null, isAuthenticated: false });
          return false;
        }
      },

      login: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          const res = await customerAccountService.login(payload);
          set({
            customer: res.customer,
            email: res.email,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to sign in.";
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      register: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          const res = await customerAccountService.register(payload);
          set({ isLoading: false, error: null });
          return res.verificationRequired;
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to create account.";
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      loginWithGoogle: async (credential) => {
        set({ isLoading: true, error: null });
        try {
          const res = await customerAccountService.loginWithGoogle(credential);
          set({
            customer: res.customer,
            email: res.email,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Google sign in failed.";
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      updateProfile: async (payload) => {
        set({ isLoading: true, error: null });
        try {
          const updated = await customerAccountService.updateProfile(payload);
          set((state) => ({
            customer: state.customer ? { ...state.customer, ...updated } : updated,
            isLoading: false,
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed to update profile.";
          set({ isLoading: false, error: message });
          throw err;
        }
      },

      updateAvatar: async (avatarUrl: string) => {
        set((state) => ({
          customer: state.customer ? { ...state.customer, avatarUrl } : null,
        }));
        try {
          await customerAccountService.updateProfile({ avatarUrl });
        } catch (err) {
          console.warn("[customer-auth] Failed to persist avatar to server:", err);
        }
      },

      logout: async () => {
        try {
          await customerAccountService.logout();
        } finally {
          set({
            customer: null,
            email: null,
            isAuthenticated: false,
            error: null,
          });
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "oceanic-customer-auth",
      partialize: (state) => ({
        customer: state.customer,
        email: state.email,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
