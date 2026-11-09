/**
 * Zod schemas for the catalog (public + admin) and discount endpoints.
 */
import { z } from "zod";
import { MAX_PAGE_LIMIT, paginationQuery } from "../lib/validation";
import {
  ADMIN_PRODUCT_SORTS,
  ADMIN_PRODUCT_STATUSES,
  ADMIN_STOCK_FILTERS,
  CATALOG_SORTS,
} from "../services/catalog.service";
import {
  DISCOUNT_STATUSES,
  validateDiscountState,
  type DiscountPatch,
  type DiscountState,
} from "../services/discount.service";
import { booleanQueryParam } from "./inventory.schema";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export const MAX_MONEY = 99_999_999.99;
const DISCOUNT_TYPES = ["PERCENTAGE", "FIXED_AMOUNT"] as const;

const hasAtMostTwoDecimals = (value: number): boolean =>
  Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** Money: a JSON number or a numeric string with <= 2 decimals; finite, >= 0. Never coerces garbage to 0. */
const moneyInput = z
  .union([
    z.number({ invalid_type_error: "must be a number" }),
    z
      .string()
      .trim()
      .regex(/^\d+(\.\d{1,2})?$/, "must be a number with at most 2 decimals")
      .transform(Number),
  ])
  .pipe(
    z
      .number()
      .finite("must be a finite number")
      .nonnegative("must not be negative")
      .max(MAX_MONEY, "is too large")
      .refine(hasAtMostTwoDecimals, "must have at most 2 decimals"),
  );

const positiveMoney = moneyInput.refine((value) => value > 0, "must be greater than 0");

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMAGE_PATH_PATTERN = /^\/images\/[A-Za-z0-9._~\-/]+$/;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const imageRef = z
  .string()
  .trim()
  .min(1)
  .max(2048)
  .refine(
    (value) => (IMAGE_PATH_PATTERN.test(value) && !value.includes("..")) || isHttpUrl(value),
    "must be an http(s) URL or a /images/... path",
  );

const slugField = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(SLUG_PATTERN, "slug must contain lower-case letters, digits and single hyphens (e.g. rose-hip-serum)");

const skuField = z
  .string()
  .trim()
  .min(2, "sku must be at least 2 characters")
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, "sku may contain letters, digits, '-' and '_'")
  .transform((value) => value.toUpperCase());

const brandField = z
  .string()
  .trim()
  .max(120)
  .nullable()
  .transform((value) => (value === null || value === "" ? null : value));

const searchQuery = z
  .string()
  .trim()
  .max(100)
  .transform((value) => (value === "" ? undefined : value));

/** `?brand=A&brand=B` or `?brand=A,B` → deduplicated list (max 20). */
const brandList = z
  .union([z.string(), z.array(z.string())])
  .transform((value) =>
    [
      ...new Set(
        (Array.isArray(value) ? value : [value])
          .flatMap((entry) => entry.split(","))
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0),
      ),
    ],
  )
  .pipe(z.array(z.string().max(120)).max(20, "at most 20 brands"));

const queryPrice = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.coerce.number().finite().nonnegative().max(MAX_MONEY).optional(),
);

const categoryRef = z.string().trim().min(1).max(255);

// ---------------------------------------------------------------------------
// Public catalog
// ---------------------------------------------------------------------------

export const catalogListQuerySchema = z
  .object({
    q: searchQuery.optional(),
    /** Category slug (canonical). */
    category: categoryRef.optional(),
    /** Deprecated alias of `category`. */
    categorySlug: categoryRef.optional(),
    brand: brandList.optional(),
    minPrice: queryPrice,
    maxPrice: queryPrice,
    inStockOnly: booleanQueryParam.optional(),
    includeInactive: booleanQueryParam.optional(),
    sort: z
      .enum(CATALOG_SORTS, { errorMap: () => ({ message: `sort must be one of ${CATALOG_SORTS.join(", ")}` }) })
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).default(24),
  })
  .superRefine((data, ctx) => {
    if (data.minPrice !== undefined && data.maxPrice !== undefined && data.minPrice > data.maxPrice) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["minPrice"], message: "minPrice must not exceed maxPrice" });
    }
    if (data.category && data.categorySlug && data.category !== data.categorySlug) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["categorySlug"],
        message: "category and categorySlug disagree; send only category",
      });
    }
  })
  .transform((data) => ({
    page: data.page,
    limit: data.limit,
    q: data.q,
    category: data.category ?? data.categorySlug,
    brands: data.brand,
    minPrice: data.minPrice,
    maxPrice: data.maxPrice,
    inStockOnly: data.inStockOnly ?? false,
    includeInactive: data.includeInactive ?? false,
    sort: data.sort,
  }));

export const productIdOrSlugParam = z.object({
  idOrSlug: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9-]+$/, "must be a product id or slug"),
});

// ---------------------------------------------------------------------------
// Admin products
// ---------------------------------------------------------------------------

export const adminProductListQuerySchema = paginationQuery
  .extend({
    q: searchQuery.optional(),
    /** Category slug or id. */
    category: categoryRef.optional(),
    brand: brandList.optional(),
    status: z.enum(ADMIN_PRODUCT_STATUSES).default("all"),
    stock: z.enum(ADMIN_STOCK_FILTERS).default("all"),
    sort: z.enum(ADMIN_PRODUCT_SORTS).default("newest"),
  })
  .transform(({ brand, ...rest }) => ({ ...rest, brands: brand }));

const productFields = {
  categoryId: z.string().uuid("categoryId must be a valid UUID"),
  title: z.string().trim().min(2, "title must be at least 2 characters").max(255),
  slug: slugField,
  sku: skuField,
  brand: brandField,
  description: z.string().trim().min(1, "description is required").max(10_000),
  basePrice: positiveMoney,
  costPrice: moneyInput,
  images: z.array(imageRef).max(12, "at most 12 images"),
  requiresBatchTracking: z.boolean(),
  lowStockThreshold: z.number().int().min(0).max(100_000),
  isActive: z.boolean(),
};

export const createProductSchema = z
  .object({
    categoryId: productFields.categoryId,
    title: productFields.title,
    /** Generated from the title when omitted. */
    slug: productFields.slug.optional(),
    sku: productFields.sku,
    brand: productFields.brand.optional(),
    description: productFields.description,
    basePrice: productFields.basePrice,
    costPrice: productFields.costPrice,
    images: productFields.images.default([]),
    requiresBatchTracking: productFields.requiresBatchTracking.default(false),
    lowStockThreshold: productFields.lowStockThreshold.default(5),
    isActive: productFields.isActive.default(true),
  })
  .strict();

export const updateProductSchema = z
  .object({
    categoryId: productFields.categoryId.optional(),
    title: productFields.title.optional(),
    /** Immutable: accepted only when equal to the current slug. */
    slug: productFields.slug.optional(),
    /** Immutable: accepted only when equal to the current sku. */
    sku: productFields.sku.optional(),
    brand: productFields.brand.optional(),
    description: productFields.description.optional(),
    basePrice: productFields.basePrice.optional(),
    costPrice: productFields.costPrice.optional(),
    images: productFields.images.optional(),
    requiresBatchTracking: productFields.requiresBatchTracking.optional(),
    lowStockThreshold: productFields.lowStockThreshold.optional(),
    isActive: productFields.isActive.optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  });

// ---------------------------------------------------------------------------
// Discounts
// ---------------------------------------------------------------------------

const isoInstant = z
  .string()
  .datetime({ offset: true, message: "must be an ISO-8601 datetime (e.g. 2026-12-01T00:00:00+06:00)" })
  .transform((value) => new Date(value));

const couponCode = z
  .string()
  .trim()
  .min(3, "code must be at least 3 characters")
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "code may contain letters, digits, '-' and '_'")
  .transform((value) => value.toUpperCase());

const discountTypeField = z.enum(DISCOUNT_TYPES, {
  errorMap: () => ({ message: "type must be PERCENTAGE or FIXED_AMOUNT" }),
});

function addFieldIssues(ctx: z.RefinementCtx, errors: Record<string, string[]>): void {
  for (const [field, messages] of Object.entries(errors)) {
    for (const message of messages) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
    }
  }
}

export const createDiscountSchema = z
  .object({
    /** Coupon code; omit/null for an automatic discount. */
    code: couponCode.nullable().optional(),
    name: z.string().trim().min(1).max(160).nullable().optional(),
    type: discountTypeField,
    value: positiveMoney,
    productId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    minOrderAmount: moneyInput.nullable().optional(),
    maxDiscountAmount: positiveMoney.nullable().optional(),
    usageLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
    perCustomerLimit: z.number().int().positive().max(10_000).nullable().optional(),
    /** Defaults to now. */
    startsAt: isoInstant.optional(),
    endsAt: isoInstant,
    isFlashSale: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .transform(
    (data): DiscountState => ({
      code: data.code ?? null,
      name: data.name ?? null,
      type: data.type,
      value: data.value,
      productId: data.productId ?? null,
      categoryId: data.categoryId ?? null,
      minOrderAmount: data.minOrderAmount ?? null,
      maxDiscountAmount: data.maxDiscountAmount ?? null,
      usageLimit: data.usageLimit ?? null,
      perCustomerLimit: data.perCustomerLimit ?? null,
      startsAt: data.startsAt ?? new Date(),
      endsAt: data.endsAt,
      isFlashSale: data.isFlashSale ?? false,
      isActive: data.isActive ?? true,
    }),
  )
  .superRefine((state, ctx) => addFieldIssues(ctx, validateDiscountState(state, { requireFutureEnd: true })));

export const updateDiscountSchema = z
  .object({
    /** Immutable: accepted only when equal to the current code. */
    code: couponCode.nullable().optional(),
    name: z.string().trim().min(1).max(160).nullable().optional(),
    type: discountTypeField.optional(),
    value: positiveMoney.optional(),
    productId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    minOrderAmount: moneyInput.nullable().optional(),
    maxDiscountAmount: positiveMoney.nullable().optional(),
    usageLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
    perCustomerLimit: z.number().int().positive().max(10_000).nullable().optional(),
    startsAt: isoInstant.optional(),
    endsAt: isoInstant.optional(),
    isFlashSale: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.values(data).some((value) => value !== undefined), {
    message: "At least one field must be provided",
  })
  .transform((data): DiscountPatch => data);

/**
 * Legacy payload of POST /admin/catalog/flash-sales (admin products page):
 * always an automatic discount; `discountType` is accepted as an alias of
 * `type`; `isFlashSale` defaults to true.
 */
export const flashSaleAliasSchema = z
  .object({
    code: z.null().optional(),
    name: z.string().trim().min(1).max(160).nullable().optional(),
    type: discountTypeField.optional(),
    discountType: discountTypeField.optional(),
    value: positiveMoney,
    productId: z.string().uuid().nullable().optional(),
    categoryId: z.string().uuid().nullable().optional(),
    maxDiscountAmount: positiveMoney.nullable().optional(),
    startsAt: isoInstant.optional(),
    endsAt: isoInstant,
    isFlashSale: z.boolean().optional(),
    isActive: z.boolean().optional(),
  })
  .strict()
  .transform((data, ctx): DiscountState => {
    if (data.type && data.discountType && data.type !== data.discountType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["discountType"], message: "type and discountType disagree" });
      return z.NEVER;
    }
    const type = data.type ?? data.discountType;
    if (!type) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["type"], message: "type is required" });
      return z.NEVER;
    }
    return {
      code: null,
      name: data.name ?? null,
      type,
      value: data.value,
      productId: data.productId ?? null,
      categoryId: data.categoryId ?? null,
      minOrderAmount: null,
      maxDiscountAmount: data.maxDiscountAmount ?? null,
      usageLimit: null,
      perCustomerLimit: null,
      startsAt: data.startsAt ?? new Date(),
      endsAt: data.endsAt,
      isFlashSale: data.isFlashSale ?? true,
      isActive: data.isActive ?? true,
    };
  })
  .superRefine((state, ctx) => addFieldIssues(ctx, validateDiscountState(state, { requireFutureEnd: true })));

export const discountListQuerySchema = paginationQuery.extend({
  /** automatic = no code (catalog prices), coupon = has a code. */
  type: z.enum(["automatic", "coupon"]).optional(),
  /** true = currently running; false = scheduled, expired or disabled. */
  active: booleanQueryParam.optional(),
  status: z.enum(DISCOUNT_STATUSES).optional(),
  discountType: discountTypeField.optional(),
  q: searchQuery.optional(),
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
});

export type CatalogListQueryInput = z.infer<typeof catalogListQuerySchema>;
export type CreateProductBody = z.infer<typeof createProductSchema>;
export type UpdateProductBody = z.infer<typeof updateProductSchema>;
export type DiscountListQueryInput = z.infer<typeof discountListQuerySchema>;
