import { z } from "zod";

// ---------------------------------------------------------------------------
// Product Creation Schema
// ---------------------------------------------------------------------------
export const createProductSchema = z.object({
  categoryId: z.string().min(1, "categoryId is required"),
  title: z
    .string()
    .min(2, "Title must be at least 2 characters")
    .max(255, "Title must not exceed 255 characters"),
  slug: z
    .string()
    .min(1)
    .max(255)
    .transform((s) =>
      s
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)+/g, ""),
    ),
  sku: z
    .string()
    .min(1)
    .max(64)
    .transform((s) =>
      s
        .toUpperCase()
        .trim()
        .replace(/[^A-Z0-9\-_]/g, "-"),
    ),
  description: z.string().min(1, "Description is required").default("Quality mother and baby care product."),
  basePrice: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return isNaN(n) ? "0.00" : n.toFixed(2);
    }),
  costPrice: z
    .union([z.string(), z.number()])
    .transform((v) => {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return isNaN(n) ? "0.00" : n.toFixed(2);
    }),
  images: z
    .union([
      z.array(z.string().min(1)),
      z.string().min(1).transform((s) => [s]),
    ])
    .default(["https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=60"]),
  requiresBatchTracking: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(false),
  lowStockThreshold: z.coerce.number().int().min(0).default(5),
  isActive: z
    .union([z.boolean(), z.string()])
    .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
    .default(true),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;

// ---------------------------------------------------------------------------
// Product Update Schema (all fields optional, resilient types)
// ---------------------------------------------------------------------------
export const updateProductSchema = z
  .object({
    categoryId: z.string().min(1).optional(),
    title: z.string().min(2).max(255).optional(),
    slug: z
      .string()
      .min(1)
      .max(255)
      .transform((s) =>
        s
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, ""),
      )
      .optional(),
    sku: z
      .string()
      .min(1)
      .max(64)
      .transform((s) =>
        s
          .toUpperCase()
          .trim()
          .replace(/[^A-Z0-9\-_]/g, "-"),
      )
      .optional(),
    description: z.string().min(1).optional(),
    basePrice: z
      .union([z.string(), z.number()])
      .transform((v) => {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        return isNaN(n) ? "0.00" : n.toFixed(2);
      })
      .optional(),
    costPrice: z
      .union([z.string(), z.number()])
      .transform((v) => {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        return isNaN(n) ? "0.00" : n.toFixed(2);
      })
      .optional(),
    images: z
      .union([
        z.array(z.string().min(1)),
        z.string().min(1).transform((s) => [s]),
      ])
      .optional(),
    requiresBatchTracking: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
      .optional(),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),
    isActive: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === "boolean" ? v : v === "true" || v === "1"))
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export type UpdateProductInput = z.infer<typeof updateProductSchema>;

// ---------------------------------------------------------------------------
// Catalog Query / Filter Schema
// ---------------------------------------------------------------------------
export const sortEnum = z.enum([
  "price_asc",
  "price_desc",
  "newest",
  "popular",
]);

export const catalogQuerySchema = z.object({
  /** Full-text / trigram search term */
  q: z.string().min(1).max(128).optional(),
  /** Category slug filter (e.g. "newborn", "skin-care") */
  categorySlug: z.string().max(255).optional(),
  /** Minimum price (inclusive) */
  minPrice: z.coerce.number().nonnegative().optional(),
  /** Maximum price (inclusive) */
  maxPrice: z.coerce.number().nonnegative().optional(),
  /** Filter in-stock items only */
  inStockOnly: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
      return false;
    }),
  /** Include inactive products (admin catalog viewing) */
  includeInactive: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => {
      if (typeof v === "boolean") return v;
      if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
      return false;
    }),
  /** Sort order */
  sort: sortEnum.default("newest"),
  /** Page number */
  page: z.coerce.number().int().min(1).default(1),
  /** Items per page */
  limit: z.coerce.number().int().min(1).max(100).default(24),
});

export type CatalogQueryInput = z.infer<typeof catalogQuerySchema>;

// ---------------------------------------------------------------------------
// Flash Sale / Discount Schema
// ---------------------------------------------------------------------------
export const flashSaleSchema = z
  .object({
    code: z.string().max(64).optional().nullable(),
    productId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    discountType: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
    type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]).optional(),
    value: z
      .union([z.string(), z.number()])
      .transform((v) => {
        const n = typeof v === "number" ? v : parseFloat(String(v));
        return isNaN(n) ? "0.00" : n.toFixed(2);
      }),
    startsAt: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), {
        message: "startsAt must be a valid ISO datetime string",
      }),
    endsAt: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), {
        message: "endsAt must be a valid ISO datetime string",
      }),
    isFlashSale: z.boolean().default(true),
    isActive: z.boolean().default(true),
  })
  .transform((data) => ({
    ...data,
    discountType: data.discountType || data.type || "PERCENTAGE",
  }))
  .refine(
    (data) => {
      const start = new Date(data.startsAt);
      const end = new Date(data.endsAt);
      return end > start;
    },
    { message: "endsAt must be after startsAt", path: ["endsAt"] },
  )
  .refine(
    (data) => {
      const hasProduct = data.productId != null;
      const hasCategory = data.categoryId != null;
      return !(hasProduct && hasCategory);
    },
    {
      message:
        "A discount must target either a product or a category — not both",
      path: ["productId"],
    },
  );

export type FlashSaleInput = z.infer<typeof flashSaleSchema>;
