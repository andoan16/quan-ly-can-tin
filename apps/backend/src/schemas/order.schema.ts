import { z } from 'zod';

export const createOrderSchema = z.object({
  customerId: z.string().uuid().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'TRANSFER']),
  note: z.string().optional(),
  items: z.array(
    z.object({
      productId: z.string().uuid(),
      quantity: z.number().positive(),
    })
  ).min(1),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;