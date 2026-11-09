/**
 * Admin product management (create / update / soft delete).
 *
 * Visibility model (see inventory.service.ts `ListingStatus`):
 * - `isActive: true` on create/update expresses the owner's intent to sell.
 *   If the product has no sellable stock it is stored hidden with
 *   `auto_deactivated_at` set (listingStatus AWAITING_STOCK) and goes live
 *   automatically when a batch is imported.
 * - `isActive: false` / DELETE is a manual deactivation: it clears
 *   `auto_deactivated_at`, so restocking never re-activates it.
 * - Products are never hard-deleted (order history and the ledger keep them).
 * - slug and sku are immutable after creation.
 */
import { eq, like, or } from "drizzle-orm";
import { db as defaultDb, type DatabaseTransaction } from "../db/client";
import { categories, products } from "../db/schema/tables";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { invalidateCatalogCache } from "../middleware/cache";
import { batchInspectorService, type BatchDTO } from "./batch-inspector.service";
import { catalogService, type AdminProductDTO } from "./catalog.service";
import { type DbExecutor, isTransaction, queryAll, runInTransaction } from "./db-executor";
import { syncProductAvailability } from "./inventory.service";
import { escapeLikePattern, fieldValidationError } from "./service-utils";

export interface CreateProductInput {
  categoryId: string;
  title: string;
  /** Generated from the title when omitted. */
  slug?: string;
  sku: string;
  brand?: string | null;
  description: string;
  basePrice: number;
  costPrice: number;
  images: string[];
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  isActive: boolean;
}

export interface UpdateProductInput {
  categoryId?: string;
  title?: string;
  /** Accepted only when equal to the current value (immutable). */
  slug?: string;
  /** Accepted only when equal to the current value (immutable). */
  sku?: string;
  brand?: string | null;
  description?: string;
  basePrice?: number;
  costPrice?: number;
  images?: string[];
  requiresBatchTracking?: boolean;
  lowStockThreshold?: number;
  isActive?: boolean;
}

export interface AdminProductDetailDTO extends AdminProductDTO {
  /** Every batch (including depleted / expired ones) in FEFO order. */
  batches: BatchDTO[];
}

const MAX_SLUG_LENGTH = 200;

/** URL slug from free text: lower-case ASCII words joined by "-". */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, "");
}

const money = (value: number): string => value.toFixed(2);

function warnIfCostAboveBase(productId: string, basePrice: number, costPrice: number): void {
  if (costPrice > basePrice) {
    console.warn(
      JSON.stringify({ level: "warn", event: "product_cost_above_base_price", productId, basePrice, costPrice }),
    );
  }
}

async function assertCategoryExists(tx: DatabaseTransaction, categoryId: string): Promise<void> {
  const [category] = await tx
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) {
    throw fieldValidationError({ categoryId: ["Category does not exist"] });
  }
}

async function generateUniqueSlug(tx: DatabaseTransaction, title: string): Promise<string> {
  const base = slugify(title) || "product";
  const taken = await tx
    .select({ slug: products.slug })
    .from(products)
    .where(or(eq(products.slug, base), like(products.slug, `${escapeLikePattern(base)}-%`)));
  const used = new Set(taken.map((row) => row.slug));
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix < 10_000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  throw AppError.conflict("Could not generate a unique slug; please provide one");
}

function mapUniqueViolation(error: unknown, slug: string | undefined, sku: string): never {
  if (isUniqueViolation(error, "products_slug_unique")) {
    throw AppError.conflict(`A product with slug "${slug ?? ""}" already exists`, { field: "slug" });
  }
  if (isUniqueViolation(error, "products_sku_unique")) {
    throw AppError.conflict(`A product with SKU "${sku}" already exists`, { field: "sku" });
  }
  throw error;
}

async function lockProduct(tx: DatabaseTransaction, id: string) {
  const [product] = await tx
    .select({
      id: products.id,
      slug: products.slug,
      sku: products.sku,
      isActive: products.isActive,
      autoDeactivatedAt: products.autoDeactivatedAt,
      basePrice: products.basePrice,
      costPrice: products.costPrice,
    })
    .from(products)
    .where(eq(products.id, id))
    .for("no key update");
  if (!product) throw AppError.notFound("Product", { id });
  return product;
}

export class ProductService {
  async getProduct(id: string, db: DbExecutor = defaultDb): Promise<AdminProductDetailDTO> {
    const [product, batches] = await queryAll(
      db,
      () => catalogService.getAdminProduct(id, db),
      () => batchInspectorService.listProductBatches(id, db),
    );
    return { ...product, batches };
  }

  async createProduct(input: CreateProductInput, db: DbExecutor = defaultDb): Promise<AdminProductDTO> {
    const ownsTransaction = !isTransaction(db);
    let productId: string;
    try {
      productId = await runInTransaction(db, async (tx) => {
        await assertCategoryExists(tx, input.categoryId);

        let slug = input.slug;
        if (slug === undefined) {
          slug = await generateUniqueSlug(tx, input.title);
        } else {
          const [existing] = await tx
            .select({ id: products.id })
            .from(products)
            .where(eq(products.slug, slug))
            .limit(1);
          if (existing) throw AppError.conflict(`A product with slug "${slug}" already exists`, { field: "slug" });
        }
        const [skuTaken] = await tx
          .select({ id: products.id })
          .from(products)
          .where(eq(products.sku, input.sku))
          .limit(1);
        if (skuTaken) throw AppError.conflict(`A product with SKU "${input.sku}" already exists`, { field: "sku" });

        const [inserted] = await tx
          .insert(products)
          .values({
            categoryId: input.categoryId,
            title: input.title,
            slug,
            sku: input.sku,
            brand: input.brand ?? null,
            description: input.description,
            basePrice: money(input.basePrice),
            costPrice: money(input.costPrice),
            images: input.images,
            requiresBatchTracking: input.requiresBatchTracking,
            lowStockThreshold: input.lowStockThreshold,
            isActive: input.isActive,
            autoDeactivatedAt: null,
          })
          .returning({ id: products.id });
        if (!inserted) throw AppError.internal("Product insert returned no row");

        if (input.isActive) {
          // No batches yet: an "active" product waits for stock (AWAITING_STOCK).
          await syncProductAvailability(tx, [inserted.id]);
        }
        return inserted.id;
      });
    } catch (error) {
      mapUniqueViolation(error, input.slug, input.sku);
    }

    warnIfCostAboveBase(productId, input.basePrice, input.costPrice);
    if (ownsTransaction) invalidateCatalogCache();
    return catalogService.getAdminProduct(productId, db);
  }

  async updateProduct(id: string, input: UpdateProductInput, db: DbExecutor = defaultDb): Promise<AdminProductDTO> {
    const ownsTransaction = !isTransaction(db);

    const prices = await runInTransaction(db, async (tx): Promise<{ basePrice: number; costPrice: number } | null> => {
      const current = await lockProduct(tx, id);

      const immutable: Record<string, string[]> = {};
      if (input.slug !== undefined && input.slug !== current.slug) {
        immutable.slug = ["slug cannot be changed after the product is created"];
      }
      if (input.sku !== undefined && input.sku !== current.sku) {
        immutable.sku = ["sku cannot be changed after the product is created"];
      }
      if (Object.keys(immutable).length > 0) throw fieldValidationError(immutable);

      if (input.categoryId !== undefined) await assertCategoryExists(tx, input.categoryId);

      const changes: Partial<typeof products.$inferInsert> = {};
      if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
      if (input.title !== undefined) changes.title = input.title;
      if (input.brand !== undefined) changes.brand = input.brand;
      if (input.description !== undefined) changes.description = input.description;
      if (input.basePrice !== undefined) changes.basePrice = money(input.basePrice);
      if (input.costPrice !== undefined) changes.costPrice = money(input.costPrice);
      if (input.images !== undefined) changes.images = input.images;
      if (input.requiresBatchTracking !== undefined) changes.requiresBatchTracking = input.requiresBatchTracking;
      if (input.lowStockThreshold !== undefined) changes.lowStockThreshold = input.lowStockThreshold;
      if (input.isActive !== undefined) {
        // Both directions are an explicit owner decision: drop the auto marker.
        changes.isActive = input.isActive;
        changes.autoDeactivatedAt = null;
      }

      if (Object.keys(changes).length > 0) {
        await tx.update(products).set(changes).where(eq(products.id, id));
      }
      if (input.isActive === true) {
        await syncProductAvailability(tx, [id]);
      }

      return input.basePrice !== undefined || input.costPrice !== undefined
        ? {
            basePrice: input.basePrice ?? Number(current.basePrice),
            costPrice: input.costPrice ?? Number(current.costPrice),
          }
        : null;
    });

    if (prices !== null) {
      warnIfCostAboveBase(id, prices.basePrice, prices.costPrice);
    }
    if (ownsTransaction) invalidateCatalogCache();
    return catalogService.getAdminProduct(id, db);
  }

  /**
   * Soft delete (manual deactivation). 409 when the product is already
   * manually inactive; an auto-hidden product is converted to a manual
   * deactivation so a restock will not bring it back.
   */
  async deactivateProduct(id: string, db: DbExecutor = defaultDb): Promise<AdminProductDTO> {
    const ownsTransaction = !isTransaction(db);
    await runInTransaction(db, async (tx) => {
      const current = await lockProduct(tx, id);
      if (!current.isActive && current.autoDeactivatedAt === null) {
        throw AppError.conflict("Product is already inactive", { id });
      }
      await tx.update(products).set({ isActive: false, autoDeactivatedAt: null }).where(eq(products.id, id));
    });
    if (ownsTransaction) invalidateCatalogCache();
    return catalogService.getAdminProduct(id, db);
  }
}

export const productService = new ProductService();
