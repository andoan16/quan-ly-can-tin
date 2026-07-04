import { create } from 'zustand';

type TabKey = 'master' | 'pos' | 'orders' | 'inventory' | 'report' | 'feedback';

interface UiState {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  /** Khi != null, OrderHistoryPage sẽ tìm đơn này và mở Drawer chi tiết */
  pendingOrderId: string | null;
  setPendingOrderId: (id: string | null) => void;
  /** Nhấn "Chi tiết" trong CustomerList → chuyển tab orders + mở đơn này */
  viewOrderDetail: (orderId: string) => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeTab: (localStorage.getItem('activeTab') as TabKey) || 'pos',
  setActiveTab: (tab) => {
    localStorage.setItem('activeTab', tab);
    set({ activeTab: tab });
  },
  pendingOrderId: null,
  setPendingOrderId: (id) => set({ pendingOrderId: id }),
  viewOrderDetail: (orderId) => {
    localStorage.setItem('activeTab', 'orders');
    set({ activeTab: 'orders', pendingOrderId: orderId });
  },
}));