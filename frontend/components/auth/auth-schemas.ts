/**
 * Login / registration form schemas. Limits mirror `backend/src/routes/auth.schema.ts`
 * (name 2–255, password 8–72, email ≤255); phones must be Bangladeshi mobiles.
 */
import { z } from "zod";
import { compactPhone, isBangladeshMobile } from "../../lib/phone";

const isEmail = (value: string): boolean => z.email().safeParse(value).success;

/** Phone numbers the API accepts for existing accounts (`^\+?[0-9]{10,15}$`). */
const isAccountPhone = (value: string): boolean => /^\+?\d{10,15}$/.test(compactPhone(value));

export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "Enter your mobile number or email address.")
    .max(255, "That is too long for a mobile number or email.")
    .refine(
      (value) => (value.includes("@") ? isEmail(value) : isAccountPhone(value)),
      "Enter a valid email address or mobile number (e.g. 01712345678)."
    ),
  password: z.string().min(1, "Enter your password.").max(128, "That password is too long."),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;

export const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, "Enter your full name (at least 2 characters).")
      .max(255, "Name must not exceed 255 characters."),
    phone: z
      .string()
      .trim()
      .min(1, "Enter your mobile number.")
      .refine(isBangladeshMobile, "Enter a valid Bangladeshi mobile number, e.g. 01712345678."),
    email: z
      .string()
      .trim()
      .max(255, "Email must not exceed 255 characters.")
      .refine((value) => value === "" || isEmail(value), "Enter a valid email address, or leave it empty."),
    password: z
      .string()
      .min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`)
      .max(PASSWORD_MAX, `Use ${PASSWORD_MAX} characters or fewer.`),
    confirmPassword: z.string().min(1, "Re-enter your password."),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    error: "Passwords don't match.",
  });

export type RegisterFormValues = z.infer<typeof registerSchema>;
