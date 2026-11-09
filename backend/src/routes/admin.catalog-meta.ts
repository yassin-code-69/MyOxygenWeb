/**
 * Mounted at /admin in src/index.ts. Categories (/admin/catalog/categories) and brands (/admin/catalog/brands).
 * See docs/API_CONTRACT.md ("Admin v2" → "Management").
 *
 * Authentication is applied per route (never `use("*")`), so these
 * middlewares do not run for the other /admin sub-apps.
 */
import { Hono } from "hono";
import { z } from "zod";
import { created, ok } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { uuidParam, validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { brandService } from "../services/brand.service";
import { categoryService } from "../services/category.service";

export const adminCatalogMetaRoute = new Hono<AuthContext>();

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_PATH_PATTERN = /^\/icons\/[A-Za-z0-9._~\-/]+$/;
const MAX_SORT_ORDER = 100_000;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** "" or whitespace → null, so forms can clear the icon with an empty input. */
const blankToNull = (value: unknown): unknown => (typeof value === "string" && value.trim() === "" ? null : value);

const iconUrlField = z.preprocess(
  blankToNull,
  z
    .string()
    .trim()
    .max(512, "iconUrl must not exceed 512 characters")
    .refine(
      (value) => (ICON_PATH_PATTERN.test(value) && !value.includes("..")) || isHttpUrl(value),
      "iconUrl must be an http(s) URL or a /icons/... path",
    )
    .nullable()
    .optional(),
);

const categoryFields = {
  name: z.string().trim().min(2, "name must have at least 2 characters").max(255, "name must not exceed 255 characters"),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(SLUG_PATTERN, "slug must contain lower-case letters, digits and single hyphens (e.g. baby-care)"),
  iconUrl: iconUrlField,
  parentId: z.string().uuid("parentId must be a valid UUID").nullable(),
  sortOrder: z.number().int("sortOrder must be an integer").min(0).max(MAX_SORT_ORDER),
  isActive: z.boolean(),
};

export const createCategorySchema = z
  .object({
    name: categoryFields.name,
    slug: categoryFields.slug.optional(),
    iconUrl: categoryFields.iconUrl,
    parentId: categoryFields.parentId.optional(),
    sortOrder: categoryFields.sortOrder.optional(),
    isActive: categoryFields.isActive.optional(),
  })
  .strict();

export const updateCategorySchema = z
  .object({
    name: categoryFields.name.optional(),
    /** Immutable: accepted only when equal to the current slug. */
    slug: categoryFields.slug.optional(),
    iconUrl: categoryFields.iconUrl,
    parentId: categoryFields.parentId.optional(),
    sortOrder: categoryFields.sortOrder.optional(),
    isActive: categoryFields.isActive.optional(),
  })
  .strict()
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "Provide at least one field to update",
  });

const brandName = z.string().trim().min(1, "must not be empty").max(120, "must not exceed 120 characters");

export const renameBrandSchema = z.object({ from: brandName, to: brandName }).strict();

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

// GET /admin/catalog/categories — every category (inactive included) with product counts
adminCatalogMetaRoute.get(
  "/catalog/categories",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_READ),
  async (c) => ok(c, await categoryService.listCategories()),
);

// POST /admin/catalog/categories
adminCatalogMetaRoute.post(
  "/catalog/categories",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("json", createCategorySchema),
  async (c) => created(c, await categoryService.createCategory(c.req.valid("json"))),
);

// PATCH /admin/catalog/categories/:id — any subset; slug immutable
adminCatalogMetaRoute.patch(
  "/catalog/categories/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("param", uuidParam),
  validate("json", updateCategorySchema),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await categoryService.updateCategory(id, c.req.valid("json")));
  },
);

// DELETE /admin/catalog/categories/:id — deactivates (409 while it has listed products)
adminCatalogMetaRoute.delete(
  "/catalog/categories/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await categoryService.deactivateCategory(id));
  },
);

// ---------------------------------------------------------------------------
// Brands
// ---------------------------------------------------------------------------

// GET /admin/catalog/brands — distinct brands with product counts and 30-day units sold
adminCatalogMetaRoute.get(
  "/catalog/brands",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_READ),
  async (c) => ok(c, await brandService.listBrands()),
);

// PATCH /admin/catalog/brands — rename a brand on every product
adminCatalogMetaRoute.patch(
  "/catalog/brands",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("json", renameBrandSchema),
  async (c) => ok(c, await brandService.renameBrand(c.req.valid("json"))),
);
