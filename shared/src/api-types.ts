import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'TRANSFER']), // Match backend Prisma enum — frontend maps CARD→TRANSFER before sending
  note: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive(),
    })
  ).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface ApiErrorResponse {
  fieldErrors?: Record<string, string[]>;
  message?: string;
}

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ApiErrorResponse;
};

export * from './enums';