import { z } from "zod";

export const orderStatusEnumValues = [
  "PENDING",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUNDED",
] as const;

export const updateOrderStatusSchema = z.object({
  status: z.enum(orderStatusEnumValues),
  courierProvider: z.string().optional(),
  trackingId: z.string().optional(),
  note: z.string().optional(),
});

export const adminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(10),
  status: z.enum(orderStatusEnumValues).optional(),
  search: z.string().optional(),
});

export const dispatchCourierSchema = z.object({
  courierProvider: z.string().optional(),
  weight: z.number().positive().optional(),
  note: z.string().optional(),
  city: z.string().optional(),
});

export type UpdateOrderStatusPayload = z.infer<typeof updateOrderStatusSchema>;
export type AdminOrdersQuery = z.infer<typeof adminOrdersQuerySchema>;
export type DispatchCourierPayload = z.infer<typeof dispatchCourierSchema>;
