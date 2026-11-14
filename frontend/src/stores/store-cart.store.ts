import { create } from "zustand";
import { persist } from "zustand/middleware";

export type CartItem = {
  productId: string;
  name: string;
  sku: string;
  sellingPrice: number;
  quantity: number;
  unit: string;
  imageUrl?: string | null;
  category?: string;
  brand?: string | null;
  available?: number;
};

export type StoreCartState = {
  items: CartItem[];
  selectedBranchId: string | null;
  fulfillmentMethod: "DELIVERY" | "COLLECTION";
  customerName: string;
  email: string;
  phone: string;
  deliveryAddress: string;
  whatsappOptIn: boolean;
  isDrawerOpen: boolean;

  // Actions
  addItem: (item: Omit<CartItem, "quantity">, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  setItemAvailability: (productId: string, available: number) => void;
  clearCart: () => void;
  setDrawerOpen: (isOpen: boolean) => void;
  setSelectedBranchId: (branchId: string | null) => void;
  setFulfillmentMethod: (method: "DELIVERY" | "COLLECTION") => void;
  setCustomerDetails: (details: Partial<{ customerName: string; email: string; phone: string; deliveryAddress: string; whatsappOptIn: boolean }>) => void;
};

export const useStoreCart = create<StoreCartState>()(
  persist(
    (set, get) => ({
      items: [],
      selectedBranchId: null,
      fulfillmentMethod: "COLLECTION",
      customerName: "",
      email: "",
      phone: "",
      deliveryAddress: "",
      whatsappOptIn: true,
      isDrawerOpen: false,
      addItem: (item, quantity = 1) => {
        const { items } = get();
        const existing = items.find((i) => i.productId === item.productId);

        if (existing) {
          set({
            items: items.map((i) =>
              i.productId === item.productId
                ? { ...i, ...item, quantity: i.quantity + quantity }
                : i
            ),
            isDrawerOpen: true,
          });
        } else {
          set({
            items: [...items, { ...item, quantity }],
            isDrawerOpen: true,
          });
        }
      },

      removeItem: (productId) => {
        const remaining = get().items.filter((i) => i.productId !== productId);
        set({
          items: remaining,
        });
      },

      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) =>
            i.productId === productId ? { ...i, quantity } : i
          ),
        });
      },

      setItemAvailability: (productId, available) => {
        set({ items: get().items.map((item) => item.productId === productId ? { ...item, available } : item) });
      },

      clearCart: () => {
        set({ items: [] });
      },

      setDrawerOpen: (isDrawerOpen) => set({ isDrawerOpen }),
      setSelectedBranchId: (selectedBranchId) => set({ selectedBranchId }),
      setFulfillmentMethod: (fulfillmentMethod) => set({ fulfillmentMethod }),
      setCustomerDetails: (details) => set((state) => ({ ...state, ...details })),
    }),
    {
      name: "oceanic-store-cart",
      partialize: (state) => ({
        items: state.items,
        selectedBranchId: state.selectedBranchId,
        fulfillmentMethod: state.fulfillmentMethod,
        customerName: state.customerName,
        email: state.email,
        phone: state.phone,
        deliveryAddress: state.deliveryAddress,
        whatsappOptIn: state.whatsappOptIn,
      }),
    }
  )
);
