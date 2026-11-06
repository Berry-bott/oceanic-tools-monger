import { create } from "zustand";

type CartProduct = {
  id: string;
  name: string;
  sku: string;
  sellingPrice: number | string;
  costPrice: number | string;
  unit: string;
};
type CartItem = { product: CartProduct; quantity: number; unitPrice: number };
type PosCartState = {
  branchId: string;
  items: CartItem[];
  addProduct: (product: CartProduct, branchId: string) => void;
  setUnitPrice: (productId: string, unitPrice: number) => void;
  adjustQuantity: (productId: string, amount: number) => void;
  clearCart: () => void;
};

export const usePosCartStore = create<PosCartState>((set) => ({
  branchId: "",
  items: [],
  addProduct: (product, branchId) =>
    set((state) => {
      const currentItems = state.branchId === branchId ? state.items : [];
      const existing = currentItems.find((item) => item.product.id === product.id);
      return {
        branchId,
        items: existing
          ? currentItems.map((item) =>
              item.product.id === product.id
                ? { ...item, quantity: item.quantity + 1 }
                : item,
            )
          : [...currentItems, { product, quantity: 1, unitPrice: Number(product.sellingPrice) }],
      };
    }),
  setUnitPrice: (productId, unitPrice) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.product.id === productId ? { ...item, unitPrice } : item,
      ),
    })),
  adjustQuantity: (productId, amount) =>
    set((state) => ({
      items: state.items.flatMap((item) =>
        item.product.id !== productId
          ? [item]
          : item.quantity + amount <= 0
            ? []
            : [{ ...item, quantity: item.quantity + amount }],
      ),
    })),
  clearCart: () => set({ items: [] }),
}));
