import { api } from './client';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface ProductVariant {
  id: string;
  code: string;
  name: string;
  sellingPrice: number;
  costPrice: number;
  factor: number;
  bundleUnitId: string;
  bundleUnit: { id: string; code: string; name: string };
  currentStock: number; // luôn 0 cho variant, xem parentProduct.currentStock
  isActive: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  categoryId: string | null;
  unitId: string | null;
  sellingPrice: number;
  costPrice: number;
  currentStock: number;
  isActive: boolean;
  // Bundle fields
  parentProductId: string | null;
  factor: number | null;
  bundleUnitId: string | null;
  // Relations
  category?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
  bundleUnit?: { id: string; name: string } | null;
  parentProduct?: { id: string; code: string; name: string; unit?: { id: string; name: string } | null; currentStock?: number } | null;
  variants?: ProductVariant[];
}

export interface Customer {
  id: string;
  code: string;
  fullName: string;
  groupId?: string;
  phone?: string;
  isActive: boolean;
  balance: number; // số dư tài khoản căn tin
  group?: { id: string; name: string };
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: number;
  costPriceAtSale: number;
  product: Product;
}

export interface Order {
  id: string;
  code: string;
  cashierId: string;
  customerId: string | null;
  paymentMethod: string;
  status: 'COMPLETED' | 'CANCELLED';
  totalComputed: number;
  balanceBefore?: number | null;
  balanceAfter?: number | null;
  note?: string | null;
  cancelledAt?: string | null;
  cancelledBy?: string | null;
  cancelReason?: string | null;
  customer?: Customer | null;
  cashier?: { id: string; fullName: string } | null;
  items: OrderItem[];
  createdAt: string;
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
};

export const customerGroupApi = {
  list: () => api.get<{ data: { id: string; code: string; name: string }[] }>('/customer-groups'),
};

export interface Category {
  id: string;
  code: string;
  name: string;
  prefix: string;
  note?: string;
  isActive: boolean;
}

export const categoryApi = {
  list: () => api.get<{ data: Category[] }>('/categories'),
  listAll: () => api.get<{ data: Category[] }>('/categories/all'),
  create: (data: Partial<Category>) => api.post<{ data: Category }>('/categories', data),
  update: (id: string, data: Partial<Category>) => api.patch<{ data: Category }>(`/categories/${id}`, data),
  delete: (id: string) => api.delete(`/categories/${id}`),
};

export const unitApi = {
  list: () => api.get<{ data: { id: string; code: string; name: string }[] }>('/units'),
};

export const productApi = {
  list: (params?: { search?: string; page?: number; size?: number }) =>
    api.get<{ data: Paginated<Product> }>('/products', { params }),
  lowStock: () => api.get<{ data: Product[] }>('/products/low-stock'),
  create: (data: Partial<Product>) => api.post<{ data: Product }>('/products', data),
  update: (id: string, data: Partial<Product>) => api.patch<{ data: Product }>(`/products/${id}`, data),
  nextCode: (categoryId?: string) => api.get<{ data: { code: string } }>('/products/next-code', { params: { categoryId } }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ data: { total: number; imported: number; created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } }>('/products/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export interface TopupTransaction {
  id: string;
  customerId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  receivedFrom?: string | null;
  note?: string | null;
  createdBy: string;
  createdAt: string;
  createdByUser?: { id: string; fullName: string };
}

export const customerApi = {
  list: (params?: { search?: string; page?: number; size?: number }) =>
    api.get<{ data: Paginated<Customer> }>('/customers', { params }),
  create: (data: Partial<Customer>) => api.post<{ data: Customer }>('/customers', data),
  update: (id: string, data: Partial<Customer>) => api.patch<{ data: Customer }>(`/customers/${id}`, data),
  topup: (id: string, payload: { amount: number; receivedFrom?: string; note?: string }) =>
    api.post<{ data: TopupTransaction & { customer: Customer } }>(`/customers/${id}/topup`, payload),
  topups: (id: string, params?: { page?: number; size?: number }) =>
    api.get<{ data: Paginated<TopupTransaction> }>(`/customers/${id}/topups`, { params }),
  orders: (id: string, params?: { page?: number; size?: number }) =>
    api.get<{ data: Paginated<Order> }>(`/customers/${id}/orders`, { params }),
  import: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<{ data: { total: number; imported: number; created: number; updated: number; skipped: number; errors: { row: number; message: string }[] } }>('/customers/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

export const orderApi = {
  create: (payload: { customerId: string; note?: string; items: { productId: string; quantity: number }[] }) => api.post<{ data: Order }>('/orders', payload),
  list: (params?: { page?: number; size?: number; from?: string; to?: string; status?: string; search?: string }) =>
    api.get<{ data: Paginated<Order> }>('/orders', { params }),
  getById: (id: string) => api.get<{ data: Order }>(`/orders/${id}`),
  cancel: (id: string, reason: string) => api.post<{ data: Order }>(`/orders/${id}/cancel`, { reason }),
};

export interface ProductSalesRow {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string | null;
  unitName: string | null;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  orderCount: number;
}

export interface ProductSalesSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalQuantity: number;
  totalOrders: number;
  productCount: number;
}

export interface ProductSalesResponse {
  items: ProductSalesRow[];
  summary: ProductSalesSummary;
  total: number;
  page: number;
  size: number;
}

export interface DailySalesRow {
  date: string;
  revenue: number;
  cost: number;
  profit: number;
  orderCount: number;
  itemQuantity: number;
}

export interface DailySalesSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalOrders: number;
  totalQuantity: number;
  dayCount: number;
}

export interface DailySalesResponse {
  items: DailySalesRow[];
  summary: DailySalesSummary;
}

export interface SavedReportSummary {
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalQuantity: number;
  totalOrders: number;
  productCount: number;
}

export interface SavedReportItem {
  id: string;
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string | null;
  unitName: string | null;
  totalQuantity: number;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  orderCount: number;
}

export interface SavedReport {
  id: string;
  name: string;
  from: string | null;
  to: string | null;
  categoryId: string | null;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  totalQuantity: number;
  totalOrders: number;
  productCount: number;
  createdBy: string;
  createdAt: string;
  createdByUser?: { id: string; fullName: string };
  items: SavedReportItem[];
}

export const reportApi = {
  productSales: (params?: {
    from?: string;
    to?: string;
    categoryId?: string;
    page?: number;
    size?: number;
    sortBy?: 'revenue' | 'quantity' | 'profit' | 'productName';
    sortDir?: 'asc' | 'desc';
  }) => api.get<{ data: ProductSalesResponse }>('/reports/product-sales', { params }),

  dailySales: (params?: { from?: string; to?: string }) =>
    api.get<{ data: DailySalesResponse }>('/reports/daily-sales', { params }),

  // Saved report snapshots
  saveReport: (payload: { name: string; from?: string; to?: string; categoryId?: string }) =>
    api.post<{ data: SavedReport }>('/reports/saved', payload),
  listReports: (params?: { page?: number; size?: number }) =>
    api.get<{ data: Paginated<SavedReport & { createdByUser?: { id: string; fullName: string } }> }>('/reports/saved', { params }),
  getReport: (id: string) =>
    api.get<{ data: SavedReport }>(`/reports/saved/${id}`),
  deleteReport: (id: string) =>
    api.delete<{ success: boolean }>(`/reports/saved/${id}`),
};

export const inventoryApi = {
  stockIn: (payload: { productId: string; quantity: number; unitCost?: number; referenceNo?: string; reason?: string }) => api.post('/inventory/stock-in', payload),
  stockOut: (payload: { productId: string; quantity: number; referenceNo?: string; reason: string }) => api.post('/inventory/stock-out', payload),
  adjust: (payload: { productId: string; newStock: number; reason: string }) => api.post('/inventory/adjust', payload),
  listTransactions: (params?: { page?: number; size?: number; productId?: string; type?: string }) => api.get('/inventory/transactions', { params }),
};

// ── Stock Count (Kiểm kê) ──────────────────────────────────────
export interface StockCountItem {
  id: string;
  stockCountId: string;
  productId: string;
  expectedQty: number;
  actualQty: number;
  difference: number;
  note?: string | null;
  product?: Product & { unit?: { id: string; name: string } | null; category?: { id: string; name: string } | null };
}

export interface StockCount {
  id: string;
  code: string;
  note?: string | null;
  createdBy: string;
  countedAt?: string | null;
  createdAt: string;
  items?: StockCountItem[];
  createdByUser?: { id: string; fullName: string };
  _count?: { items: number };
}

export const stockCountApi = {
  list: (params?: { page?: number; size?: number }) =>
    api.get<{ data: Paginated<StockCount & { createdByUser?: { id: string; fullName: string }; _count?: { items: number } }> }>('/stock-counts', { params }),
  get: (id: string) =>
    api.get<{ data: StockCount & { items: StockCountItem[] } }>(`/stock-counts/${id}`),
  create: (data: { note?: string }) => api.post<{ data: StockCount }>('/stock-counts', data),
  updateItem: (stockCountId: string, itemId: string, actualQty: number) =>
    api.patch<{ data: StockCountItem }>(`/stock-counts/${stockCountId}/items/${itemId}`, { actualQty }),
  finalize: (id: string) => api.post<{ data: StockCount }>(`/stock-counts/${id}/finalize`),
  delete: (id: string) => api.delete<{ success: boolean }>(`/stock-counts/${id}`),
};

// ── Feedback (Góp ý / Báo lỗi) ─────────────────────────────────
export type FeedbackType = 'BUG' | 'IMPROVEMENT';
export type FeedbackStatus = 'NEW' | 'DONE';

export interface Feedback {
  id: string;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  createdByUser?: { id: string; fullName: string };
}

export interface FeedbackBulkItem {
  id?: string;
  type: FeedbackType;
  content: string;
  status: FeedbackStatus;
}

export const feedbackApi = {
  list: () => api.get<{ data: Feedback[] }>('/feedback'),
  create: (data: { type: FeedbackType; content: string; status?: FeedbackStatus }) =>
    api.post<{ data: Feedback }>('/feedback', data),
  bulkUpdate: (items: FeedbackBulkItem[]) =>
    api.put<{ data: { id: string; type: string; content: string; status: string; action: string }[] }>('/feedback', { items }),
  delete: (id: string) => api.delete<{ success: boolean }>(`/feedback/${id}`),
};