import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  unitName?: string;       // Tên ĐVT (Gói, Chai, Thùng...)
  isBundle?: boolean;       // Có phải sản phẩm đóng gói không
  bundleLabel?: string;     // VD: "1 Thùng = 24 Chai"
  maxQty?: number;          // Số lượng bán tối đa theo tồn kho (cho validate)
}

interface PosState {
  customer: { id: string; fullName: string; balance: number } | null;
  cart: CartItem[];
  setCustomer: (c: PosState['customer']) => void;
  addItem: (item: CartItem) => void;
  updateQty: (productId: string, quantity: number) => void;
  removeItem: (productId: string) => void;
  clearCart: () => void;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      customer: null,
      cart: [],
      setCustomer: (customer) => set({ customer }),
      addItem: (item) => {
        const existing = get().cart.find((i) => i.productId === item.productId);
        if (existing) {
          set({
            cart: get().cart.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + (item.quantity || 1) }
                : i
            ),
          });
        } else {
          set({ cart: [...get().cart, { ...item, quantity: item.quantity || 1 }] });
        }
      },
      updateQty: (productId, quantity) => {
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          cart: get().cart.map((i) => {
            if (i.productId !== productId) return i;
            // Validate: không vượt quá maxQty (tồn kho)
            const max = i.maxQty ?? Infinity;
            const clamped = Math.min(Math.max(1, Math.floor(quantity)), max);
            return { ...i, quantity: clamped };
          }),
        });
      },
      removeItem: (productId) =>
        set({ cart: get().cart.filter((i) => i.productId !== productId) }),
      clearCart: () => set({ cart: [], customer: null }),
    }),
    {
      name: 'pos-storage', // key trong localStorage
      // Chỉ persist customer + cart — không persist hàm
      partialize: (state) => ({ customer: state.customer, cart: state.cart }),
    }
  )
);