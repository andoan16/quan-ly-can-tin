import { create } from 'zustand';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface PosState {
  customer: { id: string; fullName: string } | null;
  cart: CartItem[];
  setCustomer: (c: PosState['customer']) => void;
  addItem: (item: Omit<CartItem, 'quantity'>) => void;
  updateQty: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

export const usePosStore = create<PosState>((set, get) => ({
  customer: null,
  cart: [],
  setCustomer: (customer) => set({ customer }),
  addItem: (item) => {
    const existing = get().cart.find((i) => i.productId === item.productId);
    if (existing) {
      set({
        cart: get().cart.map((i) =>
          i.productId === item.productId ? { ...i, quantity: i.quantity + 1 } : i
        ),
      });
    } else {
      set({ cart: [...get().cart, { ...item, quantity: 1 }] });
    }
  },
  updateQty: (productId, quantity) => {
    if (quantity <= 0) {
      get().removeItem(productId);
      return;
    }
    set({
      cart: get().cart.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
    });
  },
  removeItem: (productId) => set({ cart: get().cart.filter((i) => i.productId !== productId) }),
  clearCart: () => set({ cart: [], customer: null }),
}));
