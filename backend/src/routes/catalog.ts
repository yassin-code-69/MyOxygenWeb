/**
 * Catalog & discount routes — mounted at "/" (see src/index.ts).
 *
 * Public (cached for anonymous callers):
 *   GET    /catalog/categories
 *   GET    /catalog/products                 list + facets (`includeInactive` needs PRODUCTS_READ)
 *   GET    /catalog/products/:idOrSlug
 *   GET    /catalog/flash-sales
 * Admin products (PRODUCTS_READ / PRODUCTS_WRITE):
 *   GET    /admin/catalog/products
 *   GET    /admin/catalog/products/:id
 *   POST   /admin/catalog/products
 *   PATCH  /admin/catalog/products/:id        (isActive: true re-activates)
 *   DELETE /admin/catalog/products/:id        (soft delete)
 * Discounts (DISCOUNTS_MANAGE):
 *   GET    /admin/discounts
 *   GET    /admin/discounts/:id
 *   POST   /admin/discounts
 *   PATCH  /admin/discounts/:id
 *   DELETE /admin/discounts/:id              (deactivate)
 *   POST   /admin/catalog/flash-sales        (legacy alias: automatic flash sale)
 *
 * Handlers only validate, call a service and shape the envelope.
 */
import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { buildPaginationMeta, created, ok, paginated } from "../lib/http";
import { Permissions } from "../lib/rbac";
import { uuidParam, validate } from "../lib/validation";
import { cacheMiddleware } from "../middleware/cache";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { catalogService, type CatalogFacets } from "../services/catalog.service";
import { discountService } from "../services/discount.service";
import { productService } from "../services/product.service";
import type { ApiSuccess, PaginationMeta } from "../types";
import {
  adminProductListQuerySchema,
  catalogListQuerySchema,
  createDiscountSchema,
  createProductSchema,
  discountListQuerySchema,
  flashSaleAliasSchema,
  productIdOrSlugParam,
  updateDiscountSchema,
  updateProductSchema,
} from "./catalog.schema";

export const catalog = new Hono<AuthContext>();

/** Pagination meta plus facets for the storefront filter sidebar. */
export type CatalogListMeta = PaginationMeta & { facets: CatalogFacets };

function paginatedWithFacets<T>(
  c: Context,
  items: T[],
  pagination: { page: number; limit: number; total: number },
  facets: CatalogFacets,
): Response {
  const body: ApiSuccess<T[], CatalogListMeta> = {
    success: true,
    data: items,
    meta: { ...buildPaginationMeta(pagination.page, pagination.limit, pagination.total), facets },
  };
  return c.json(body, 200);
}

/**
 * `includeInactive=true|1` exposes hidden products: it requires an
 * authenticated user with PRODUCTS_READ (401 / 403 otherwise). Such requests
 * carry an Authorization header, so the cache never stores them.
 */
const guardIncludeInactive = createMiddleware<AuthContext>(async (c, next) => {
  const flag = c.req.query("includeInactive");
  if (flag === "true" || flag === "1") {
    await requireAuth(c, async () => {
      await requirePermission(Permissions.PRODUCTS_READ)(c, next);
    });
    return;
  }
  await next();
});

// ===========================================================================
// Public catalog
// ===========================================================================

catalog.get("/catalog/categories", cacheMiddleware(300), async (c) => {
  return ok(c, await catalogService.listCategories());
});

catalog.get(
  "/catalog/products",
  guardIncludeInactive,
  cacheMiddleware(60),
  validate("query", catalogListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total, facets } = await catalogService.listProducts(query);
    return paginatedWithFacets(c, items, { page: query.page, limit: query.limit, total }, facets);
  },
);

catalog.get(
  "/catalog/products/:idOrSlug",
  cacheMiddleware(60),
  validate("param", productIdOrSlugParam),
  async (c) => {
    const { idOrSlug } = c.req.valid("param");
    return ok(c, await catalogService.getProductDetail(idOrSlug));
  },
);

catalog.get("/catalog/flash-sales", cacheMiddleware(30), async (c) => {
  return ok(c, await catalogService.listActiveFlashSales());
});

// ===========================================================================
// Admin products
// ===========================================================================

catalog.get(
  "/admin/catalog/products",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_READ),
  validate("query", adminProductListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await catalogService.listAdminProducts(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

catalog.get(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_READ),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await productService.getProduct(id));
  },
);

catalog.post(
  "/admin/catalog/products",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("json", createProductSchema),
  async (c) => {
    return created(c, await productService.createProduct(c.req.valid("json")));
  },
);

catalog.patch(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("param", uuidParam),
  validate("json", updateProductSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await productService.updateProduct(id, c.req.valid("json")));
  },
);

catalog.delete(
  "/admin/catalog/products/:id",
  requireAuth,
  requirePermission(Permissions.PRODUCTS_WRITE),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await productService.deactivateProduct(id));
  },
);

// ===========================================================================
// Discounts
// ===========================================================================

catalog.get(
  "/admin/discounts",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
  validate("query", discountListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await discountService.listDiscounts(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

catalog.get(
  "/admin/discounts/:id",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await discountService.getDiscount(id));
  },
);

catalog.post(
  "/admin/discounts",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
  validate("json", createDiscountSchema),
  async (c) => {
    return created(c, await discountService.createDiscount(c.req.valid("json")));
  },
);

catalog.patch(
  "/admin/discounts/:id",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
  validate("param", uuidParam),
  validate("json", updateDiscountSchema),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await discountService.updateDiscount(id, c.req.valid("json")));
  },
);

catalog.delete(
  "/admin/discounts/:id",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
  validate("param", uuidParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await discountService.deactivateDiscount(id));
  },
);

catalog.post(
  "/admin/catalog/flash-sales",
  requireAuth,
  requirePermission(Permissions.DISCOUNTS_MANAGE),
  validate("json", flashSaleAliasSchema),
  async (c) => {
    return created(c, await discountService.createDiscount(c.req.valid("json")));
  },
);
