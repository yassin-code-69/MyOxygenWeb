import { z } from "zod";

export const registerSchema = z.object({
  fullName: z.string().min(2, "Name must have at least 2 characters"),
  phone: z.string().regex(/^\+?[0-9]{10,15}$/, "Invalid phone number format"),
  email: z.string().email("Invalid email address").optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const loginSchema = z.object({
  identifier: z.string().min(3, "Phone or Email is required"),
  password: z.string().min(6, "Password is required"),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
