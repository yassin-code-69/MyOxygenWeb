/**
 * Auth & RBAC types — mirror `backend/src/types/index.ts` (USER_ROLES) and
 * `backend/src/lib/rbac.ts` (Permissions).
 */

export const USER_ROLES = [
  "SUPER_ADMIN",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "SUPPORT_STAFF",
  "CUSTOMER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Roles allowed into the `/admin` back-office. */
export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "INVENTORY_MANAGER",
  "ORDER_MANAGER",
  "MARKETING_MANAGER",
  "SUPPORT_STAFF",
] as const satisfies readonly UserRole[];

export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role);
}

export const PERMISSIONS = {
  PRODUCTS_READ: "products:read",
  PRODUCTS_WRITE: "products:write",
  BATCHES_MANAGE: "batches:manage",
  STOCK_ADJUST: "stock:adjust",
  ORDERS_READ: "orders:read",
  ORDERS_STATUS_UPDATE: "orders:status_update",
  COURIER_ASSIGN: "courier:assign",
  INVOICE_GENERATE: "invoice:generate",
  REFUNDS_REQUEST: "refunds:request",
  REFUNDS_APPROVE: "refunds:approve",
  DISCOUNTS_MANAGE: "discounts:manage",
  ANALYTICS_READ: "analytics:read",
  STAFF_MANAGE: "staff:manage",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export interface UserDTO {
  id: string;
  fullName: string;
  email: string | null;
  phone: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

/** Access + refresh token pair returned by `/auth/login` and `/auth/register`. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

/** `data` of `/auth/login` and `/auth/register`. */
export interface AuthSession extends AuthTokens {
  user: UserDTO;
}

/** `data` of `/auth/refresh` (access token only). */
export interface RefreshResult {
  accessToken: string;
}

export interface LoginPayload {
  /** Email or Bangladeshi mobile number. */
  identifier: string;
  password: string;
}

export interface RegisterPayload {
  fullName: string;
  phone: string;
  email?: string | null;
  /** 8–72 characters (bcrypt limit). */
  password: string;
}

/** User object returned by `/auth/login`, `/auth/register` (API contract `PublicUser`). */
export interface PublicUser {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  role: UserRole;
}

/** `data` of `POST /auth/login` and `POST /auth/register`. */
export interface AuthSessionDTO extends AuthTokens {
  user: PublicUser;
}

/** `data` of `GET /auth/me`. */
export interface MeDTO extends PublicUser {
  createdAt: string;
}
