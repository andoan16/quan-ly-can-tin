import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.string().uuid(), // bắt buộc — người mua phải có tài khoản
  paymentMethod: z.enum(['CASH', 'TRANSFER']).optional(), // deprecated, luôn CASH
  note: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive(),
    })
  ).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;