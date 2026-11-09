import { z } from "zod";
import { normalizeBangladeshMobile } from "../services/phone";

/** Bangladeshi mobile in any accepted format, stored canonically as 01XXXXXXXXX. */
const bangladeshMobile = z
  .string()
  .trim()
  .max(32)
  .transform((value, ctx) => {
    const normalized = normalizeBangladeshMobile(value);
    if (normalized === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid Bangladeshi mobile number (01XXXXXXXXX)",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Name must have at least 2 characters")
    .max(255, "Name must not exceed 255 characters"),
  phone: bangladeshMobile,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Invalid email address")
    .max(255)
    .optional()
    .nullable(),
  // bcrypt only uses the first 72 bytes, so longer passwords are rejected rather than silently truncated.
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters"),
});

export const loginSchema = z.object({
  identifier: z.string().trim().min(3, "Phone or Email is required").max(255),
  password: z.string().min(1, "Password is required").max(128),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required").max(4096),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
