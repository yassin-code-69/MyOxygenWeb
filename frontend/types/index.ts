/**
 * Frontend DTOs & API contracts, split by domain:
 *
 *   api.ts      envelopes, error payload, PaginationMeta
 *   catalog.ts  categories, products, batches, discounts, ProductCardData
 *   cart.ts     cart line items & coupons
 *   order.ts    order / payment statuses, checkout payloads
 *   auth.ts     roles, permissions, users, sessions
 *   admin.ts    back-office (batches, ledger, admin orders, invoices, telemetry)
 *
 * Import from the barrel (`../types`) or the domain file — both are supported.
 */
export * from "./api";
export * from "./catalog";
export * from "./cart";
export * from "./order";
export * from "./auth";
export * from "./admin";
