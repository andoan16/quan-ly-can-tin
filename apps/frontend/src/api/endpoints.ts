import { api } from './client';

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface UnitConversion {
  id: string;
  productId: string;
  fromUnitId: string;
  toUnitId: string;
  factor: number;
  fromUnit: { id: string; code: string; name: string };
  toUnit: { id: string; code: string; name: string };
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
  category?: { id: string; name: string } | null;
  unit?: { id: string; name: string } | null;
  unitConversions?: UnitConversion[];
}

export interface Customer {
  id: string;
  code: string;
  fullName: string;
  groupId?: string;
  phone?: string;
  isActive: boolean;
  group?: { id: string; name: string };
}

export interface Order {
  id: string;
  code: string;
  totalComputed: number;
  paymentMethod: string;
  customer?: Customer;
  items: { id: string; productId: string; quantity: number; unitPrice: number; product: Product }[];
  createdAt: string;
}

export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
};

export const customerGroupApi = {
  list: () => api.get<{ data: { id: string; code: string; name: string }[] }>('/customer-groups'),
};

export const categoryApi = {
  list: () => api.get<{ data: { id: string; code: string; name: string }[] }>('/categories'),
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
  listConversions: (productId: string) => api.get<{ data: UnitConversion[] }>(`/products/${productId}/conversions`),
  createConversion: (productId: string, data: { fromUnitId: string; toUnitId: string; factor: number }) =>
    api.post<{ data: UnitConversion }>(`/products/${productId}/conversions`, data),
  deleteConversion: (productId: string, conversionId: string) =>
    api.delete(`/products/${productId}/conversions/${conversionId}`),
};

export const customerApi = {
  list: (params?: { search?: string; page?: number; size?: number }) =>
    api.get<{ data: Paginated<Customer> }>('/customers', { params }),
  create: (data: Partial<Customer>) => api.post<{ data: Customer }>('/customers', data),
  update: (id: string, data: Partial<Customer>) => api.patch<{ data: Customer }>(`/customers/${id}`, data),
};

export const orderApi = {
  create: (payload: { customerId?: string; paymentMethod: string; note?: string; items: { productId: string; quantity: number }[] }) => api.post<{ data: Order }>('/orders', payload),
  list: (params?: { page?: number; size?: number; from?: string; to?: string }) =>
    api.get<{ data: Paginated<Order> }>('/orders', { params }),
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

export const reportApi = {
  productSales: (params?: {
    from?: string;
    to?: string;
    categoryId?: string;
    page?: number;
    size?: number;
    sortBy?: 'revenue' | 'quantity' | 'profit' | 'name';
    sortDir?: 'asc' | 'desc';
  }) => api.get<{ data: ProductSalesResponse }>('/reports/product-sales', { params }),
};

export const inventoryApi = {
  stockIn: (payload: { productId: string; quantity: number; unitId?: string; unitCost?: number; referenceNo?: string; reason?: string }) => api.post('/inventory/stock-in', payload),
  listTransactions: (params?: { page?: number; size?: number; productId?: string; type?: string }) => api.get('/inventory/transactions', { params }),
};