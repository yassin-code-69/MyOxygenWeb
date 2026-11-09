/**
 * Category administration (/admin/catalog/categories).
 *
 * Rules:
 * - The slug is generated from the name when omitted (kebab-case, latin only)
 *   and is immutable afterwards (PATCH accepts it only when unchanged → else 422).
 *   Duplicate slugs answer 409.
 * - `parentId` must reference an existing category and must not create a cycle
 *   (422). Hierarchy writes hold a transaction-scoped advisory lock so two
 *   concurrent re-parentings cannot close a loop between them.
 * - Deleting deactivates. A category cannot be deactivated (DELETE or
 *   PATCH isActive=false) while it still holds listed products: ACTIVE ones,
 *   and AWAITING_STOCK ones that the inventory engine would re-activate on the
 *   next batch import (409).
 * - Every committed write invalidates the public catalog cache.
 */
import { and, asc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db as defaultDb, type DatabaseTransaction } from "../db/client";
import { categories, products } from "../db/schema/tables";
import { isUniqueViolation } from "../lib/db-errors";
import { AppError } from "../lib/errors";
import { invalidateCatalogCache } from "../middleware/cache";
import { type DbExecutor, runInTransaction } from "./db-executor";
import { slugify } from "./product.service";
import { fieldValidationError, toIso } from "./service-utils";

const HIERARCHY_LOCK = "my-oxygen:category-hierarchy";

export interface AdminCategoryDTO {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
  activeProductCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  iconUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  iconUrl?: string | null;
  parentId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

const categoryWithCounts = {
  id: categories.id,
  name: categories.name,
  slug: categories.slug,
  iconUrl: categories.iconUrl,
  parentId: categories.parentId,
  sortOrder: categories.sortOrder,
  isActive: categories.isActive,
  createdAt: categories.createdAt,
  updatedAt: categories.updatedAt,
  productCount: sql<number>`count(${products.id})::int`.mapWith(Number),
  activeProductCount: sql<number>`(count(${products.id}) filter (where ${products.isActive}))::int`.mapWith(Number),
} as const;

interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  iconUrl: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  productCount: number;
  activeProductCount: number;
}

function toDTO(row: CategoryRow): AdminCategoryDTO {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    iconUrl: row.iconUrl,
    parentId: row.parentId,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    productCount: row.productCount,
    activeProductCount: row.activeProductCount,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function duplicateSlug(slug: string): AppError {
  return AppError.conflict(`A category with slug "${slug}" already exists`, { field: "slug" });
}

async function lockHierarchy(tx: DatabaseTransaction): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${HIERARCHY_LOCK}))`);
}

/** 422 unless `parentId` exists and (when `childId` is given) is not `childId` or one of its descendants. */
async function assertValidParent(tx: DatabaseTransaction, parentId: string, childId?: string): Promise<void> {
  if (childId !== undefined && parentId === childId) {
    throw fieldValidationError({ parentId: ["A category cannot be its own parent"] });
  }
  const [parent] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.id, parentId));
  if (!parent) {
    throw fieldValidationError({ parentId: ["Parent category does not exist"] });
  }
  if (childId === undefined) return;

  // Walk up from the proposed parent; reaching the child means a cycle.
  const result = await tx.execute(sql`
    WITH RECURSIVE ancestors(id, parent_id, depth) AS (
      SELECT ${categories.id}, ${categories.parentId}, 0 FROM ${categories} WHERE ${categories.id} = ${parentId}
      UNION ALL
      SELECT c.id, c.parent_id, a.depth + 1
      FROM ${categories} c JOIN ancestors a ON c.id = a.parent_id
      WHERE a.depth < 1000
    )
    SELECT 1 AS hit FROM ancestors WHERE id = ${childId} LIMIT 1
  `);
  if (result.rows.length > 0) {
    throw fieldValidationError({ parentId: ["This parent would create a cycle in the category tree"] });
  }
}

/** Products that keep a category "in use": ACTIVE, or AWAITING_STOCK (auto-hidden, auto-returning). */
async function countListedProducts(tx: DatabaseTransaction, categoryId: string): Promise<number> {
  const [row] = await tx
    .select({ value: sql<number>`count(*)::int`.mapWith(Number) })
    .from(products)
    .where(
      and(
        eq(products.categoryId, categoryId),
        or(eq(products.isActive, true), isNotNull(products.autoDeactivatedAt)),
      ),
    );
  return row?.value ?? 0;
}

async function assertCanDeactivate(tx: DatabaseTransaction, categoryId: string): Promise<void> {
  const listed = await countListedProducts(tx, categoryId);
  if (listed > 0) {
    throw AppError.conflict(
      `This category still has ${listed} active or awaiting-stock product(s). Move or deactivate them first.`,
      { listedProductCount: listed },
    );
  }
}

export class CategoryService {
  constructor(private readonly db: DbExecutor = defaultDb) {}

  /** Every category (inactive included) with product counts, in storefront order. */
  async listCategories(): Promise<AdminCategoryDTO[]> {
    const rows = await this.db
      .select(categoryWithCounts)
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .groupBy(categories.id)
      .orderBy(asc(categories.sortOrder), asc(categories.name), asc(categories.id));
    return rows.map(toDTO);
  }

  async createCategory(input: CreateCategoryInput): Promise<AdminCategoryDTO> {
    const slug = input.slug ?? slugify(input.name);
    if (slug === "") {
      throw fieldValidationError({
        slug: ["The name has no latin letters or digits to build a slug from; provide a slug"],
      });
    }

    let id: string;
    try {
      id = await runInTransaction(this.db, async (tx) => {
        const parentId = input.parentId ?? null;
        if (parentId !== null) {
          await lockHierarchy(tx);
          await assertValidParent(tx, parentId);
        }
        const [taken] = await tx.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
        if (taken) throw duplicateSlug(slug);

        const [created] = await tx
          .insert(categories)
          .values({
            name: input.name,
            slug,
            iconUrl: input.iconUrl ?? null,
            parentId,
            sortOrder: input.sortOrder ?? 0,
            isActive: input.isActive ?? true,
          })
          .returning({ id: categories.id });
        if (!created) throw AppError.internal("Category could not be created");
        return created.id;
      });
    } catch (error) {
      if (isUniqueViolation(error, "categories_slug_unique")) throw duplicateSlug(slug);
      throw error;
    }

    invalidateCatalogCache();
    return this.getCategory(id);
  }

  async updateCategory(id: string, patch: UpdateCategoryInput): Promise<AdminCategoryDTO> {
    await runInTransaction(this.db, async (tx) => {
      if (patch.parentId !== undefined && patch.parentId !== null) {
        await lockHierarchy(tx);
      }
      const [current] = await tx
        .select({ id: categories.id, slug: categories.slug, isActive: categories.isActive, parentId: categories.parentId })
        .from(categories)
        .where(eq(categories.id, id))
        .for("update");
      if (!current) throw AppError.notFound("Category");

      if (patch.slug !== undefined && patch.slug !== current.slug) {
        throw fieldValidationError({ slug: ["The slug cannot be changed once the category exists"] });
      }
      if (patch.parentId !== undefined && patch.parentId !== null && patch.parentId !== current.parentId) {
        await assertValidParent(tx, patch.parentId, id);
      }
      if (patch.isActive === false && current.isActive) {
        await assertCanDeactivate(tx, id);
      }

      const values: Partial<typeof categories.$inferInsert> = {};
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.iconUrl !== undefined) values.iconUrl = patch.iconUrl;
      if (patch.parentId !== undefined) values.parentId = patch.parentId;
      if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
      if (patch.isActive !== undefined) values.isActive = patch.isActive;
      if (Object.keys(values).length > 0) {
        await tx.update(categories).set(values).where(eq(categories.id, id));
      }
    });

    invalidateCatalogCache();
    return this.getCategory(id);
  }

  /** Soft delete: deactivates (409 when already inactive or still holding listed products). */
  async deactivateCategory(id: string): Promise<AdminCategoryDTO> {
    await runInTransaction(this.db, async (tx) => {
      const [current] = await tx
        .select({ isActive: categories.isActive })
        .from(categories)
        .where(eq(categories.id, id))
        .for("update");
      if (!current) throw AppError.notFound("Category");
      if (!current.isActive) throw AppError.conflict("Category is already inactive");
      await assertCanDeactivate(tx, id);
      await tx.update(categories).set({ isActive: false }).where(eq(categories.id, id));
    });

    invalidateCatalogCache();
    return this.getCategory(id);
  }

  async getCategory(id: string): Promise<AdminCategoryDTO> {
    const [row] = await this.db
      .select(categoryWithCounts)
      .from(categories)
      .leftJoin(products, eq(products.categoryId, categories.id))
      .where(eq(categories.id, id))
      .groupBy(categories.id);
    if (!row) throw AppError.notFound("Category");
    return toDTO(row);
  }
}

export const categoryService = new CategoryService();
