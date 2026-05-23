import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string().cuid(),
  warehouseId: z.string().cuid(),
  quantity: z.number().int().positive().max(100),
});

export const ReservationIdSchema = z.object({
  id: z.string().cuid(),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;
