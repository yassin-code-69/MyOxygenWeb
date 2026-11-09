/**
 * Idempotent database seed: `bun run db:seed`.
 *
 * Safe to re-run:
 * - categories upsert by slug, products by slug (catalog fields are seed-owned),
 *   users by email, coupons by lower(code), automatic discounts by name;
 * - batches are inserted only when (product, batch number) is missing and are
 *   never modified afterwards (stock is operational data), each new batch gets
 *   one IMPORT ledger row.
 * Everything runs in ONE transaction: either the whole seed applies or nothing.
 *
 * Accounts:
 * - Super admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. Outside production
 *   they default to the documented dev credentials (context/SPECIFICATION.md);
 *   in production both are required.
 * - Outside production, one dev account per staff role plus a demo customer
 *   (password DEV_STAFF_PASSWORD below) so role-based UI can be exercised.
 */
import * as bcrypt from "bcryptjs";
import { and, eq, inArray, isNotNull, isNull, or, sql, type AnyColumn } from "drizzle-orm";
import { env } from "../env";
import type { UserRole } from "../types";
import { closeDb, db, type DatabaseTransaction } from "./client";
import {
  categories,
  discounts,
  productBatches,
  products,
  stockHistoryLogs,
  users,
} from "./schema/tables";

const BCRYPT_ROUNDS = 10;
const DEV_ADMIN_EMAIL = "admin@myoxygen.com";
const DEV_ADMIN_PASSWORD = "Admin@MyOxygen2026";
export const DEV_STAFF_PASSWORD = "Staff@MyOxygen2026";

// ---------------------------------------------------------------------------
// Dates (relative to "today" in the business time zone)
// ---------------------------------------------------------------------------

function todayIn(timeZone: string): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return new Date(`${ymd}T00:00:00.000Z`);
}

function shiftDate(base: Date, offset: { days?: number; months?: number }): Date {
  const d = new Date(base.getTime());
  if (offset.months) d.setUTCMonth(d.getUTCMonth() + offset.months);
  if (offset.days) d.setUTCDate(d.getUTCDate() + offset.days);
  return d;
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Seed data
// ---------------------------------------------------------------------------

type CategorySlug = "newborn" | "mother-care" | "skin-care" | "inner-wear";

const CATEGORY_SEED: ReadonlyArray<{ slug: CategorySlug; name: string; iconUrl: string; sortOrder: number }> = [
  { slug: "newborn", name: "Newborn", iconUrl: "/icons/newborn.svg", sortOrder: 1 },
  { slug: "mother-care", name: "Mother Care", iconUrl: "/icons/mother-care.svg", sortOrder: 2 },
  { slug: "skin-care", name: "Skin Care", iconUrl: "/icons/skin-care.svg", sortOrder: 3 },
  { slug: "inner-wear", name: "Inner Wear", iconUrl: "/icons/inner-wear.svg", sortOrder: 4 },
];

interface BatchSeed {
  /** Expiry relative to today. */
  expiresIn: { days?: number; months?: number };
  quantity: number;
}

interface ProductSeed {
  slug: string;
  title: string;
  sku: string;
  brand: string;
  category: CategorySlug;
  /** Regular (compare-at) price. */
  basePrice: number;
  /** Price shown on the storefront; when lower than basePrice an automatic discount is created. */
  salePrice?: number;
  costPrice: number;
  description: string;
  images: string[];
  requiresBatchTracking: boolean;
  lowStockThreshold: number;
  batches: BatchSeed[];
  createdAt: string;
}

const LONG_DATED: BatchSeed["expiresIn"] = { months: 60 };

/** Ported from frontend/lib/catalog-data.ts plus the original backend seed products. */
const PRODUCT_SEED: ReadonlyArray<ProductSeed> = [
  {
    slug: "pampers-premium-care-diapers",
    title: "Pampers Premium Care Diapers",
    sku: "NWB-DP-002",
    brand: "Pampers",
    category: "newborn",
    basePrice: 1450,
    salePrice: 1250,
    costPrice: 900,
    description:
      "Premium Care diapers with an ultra-soft, breathable top sheet and up to 12 hours of dryness. Wetness indicator and stretchy sides for a snug, leak-free fit.",
    images: ["/images/prod-diaper.svg", "/images/prod-diaper.jpg"],
    requiresBatchTracking: false,
    lowStockThreshold: 15,
    batches: [{ expiresIn: LONG_DATED, quantity: 120 }],
    createdAt: "2026-09-01T00:00:00.000Z",
  },
  {
    slug: "johnsons-baby-lotion",
    title: "Johnson's Baby Lotion",
    sku: "NWB-LT-001",
    brand: "Johnson's",
    category: "newborn",
    basePrice: 650,
    salePrice: 550,
    costPrice: 380,
    description:
      "Clinically proven mild baby lotion that moisturises delicate skin for 24 hours. Hypoallergenic, paraben-free and dermatologist tested.",
    images: ["https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { days: 45 }, quantity: 40 },
      { expiresIn: { months: 8 }, quantity: 60 },
      { expiresIn: { months: 18 }, quantity: 80 },
    ],
    createdAt: "2026-09-02T00:00:00.000Z",
  },
  {
    slug: "baby-romper",
    title: "Baby Romper",
    sku: "NWB-RM-001",
    brand: "Huggies",
    category: "newborn",
    basePrice: 950,
    salePrice: 790,
    costPrice: 520,
    description:
      "100% cotton snap-button romper that is gentle on newborn skin. Easy nappy changes, tag-free neckline and machine washable.",
    images: ["https://images.unsplash.com/photo-1522771930-78848d9293e8?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: false,
    lowStockThreshold: 8,
    batches: [{ expiresIn: LONG_DATED, quantity: 70 }],
    createdAt: "2026-09-03T00:00:00.000Z",
  },
  {
    slug: "silicone-baby-feeding-set",
    title: "Silicone Baby Feeding Set",
    sku: "NWB-FS-001",
    brand: "Gerber",
    category: "newborn",
    basePrice: 1350,
    salePrice: 1150,
    costPrice: 760,
    description:
      "BPA-free food-grade silicone bowl, plate, spoon and bib set. Suction base prevents spills; dishwasher and microwave safe.",
    images: ["https://images.unsplash.com/photo-1596461404969-9ae70f2830c1?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: false,
    lowStockThreshold: 8,
    batches: [{ expiresIn: LONG_DATED, quantity: 55 }],
    createdAt: "2026-09-04T00:00:00.000Z",
  },
  {
    slug: "maternity-pillow",
    title: "Maternity Pillow",
    sku: "MTR-PL-001",
    brand: "Aveeno",
    category: "mother-care",
    basePrice: 2250,
    salePrice: 1850,
    costPrice: 1250,
    description:
      "Full-body U-shaped pregnancy pillow that supports back, bump and hips for restful sleep. Removable, washable cotton cover.",
    images: ["https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: false,
    lowStockThreshold: 5,
    batches: [{ expiresIn: LONG_DATED, quantity: 30 }],
    createdAt: "2026-09-05T00:00:00.000Z",
  },
  {
    slug: "mustela-baby-skincare-set",
    title: "Mustela Baby Skincare Set",
    sku: "SKN-ST-001",
    brand: "Mustela",
    category: "skin-care",
    basePrice: 2850,
    salePrice: 2450,
    costPrice: 1700,
    description:
      "Essential baby skincare gift set with gentle cleansing gel, hydra-bebe body lotion and vitamin barrier cream, formulated with natural avocado perseose.",
    images: ["/images/test-pexels-1.jpg"], // the previous Unsplash photo was removed upstream (404)
    requiresBatchTracking: true,
    lowStockThreshold: 5,
    batches: [
      { expiresIn: { months: 8 }, quantity: 25 },
      { expiresIn: { months: 18 }, quantity: 40 },
    ],
    createdAt: "2026-09-06T00:00:00.000Z",
  },
  {
    slug: "nursing-bra",
    title: "Nursing Bra",
    sku: "INW-BR-002",
    brand: "Cetaphil",
    category: "inner-wear",
    basePrice: 1170,
    salePrice: 1050,
    costPrice: 680,
    description:
      "Wire-free nursing bra with one-hand drop-down clips, soft breathable cotton cups and wide comfort straps for all-day support.",
    images: ["/images/prod-bra.jpg"],
    requiresBatchTracking: false,
    lowStockThreshold: 8,
    batches: [{ expiresIn: LONG_DATED, quantity: 65 }],
    createdAt: "2026-09-07T00:00:00.000Z",
  },
  {
    slug: "simple-face-wash",
    title: "Simple Face Wash",
    sku: "SKN-FW-002",
    brand: "Simple",
    category: "skin-care",
    basePrice: 820,
    salePrice: 620,
    costPrice: 410,
    description:
      "Kind to Skin refreshing facial wash with pro-vitamin B5 and vitamin E. No perfume, no harsh chemicals — ideal for sensitive skin during and after pregnancy.",
    images: ["/images/prod-facewash.jpg"],
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { days: 21 }, quantity: 30 },
      { expiresIn: { months: 8 }, quantity: 60 },
      { expiresIn: { months: 18 }, quantity: 90 },
    ],
    createdAt: "2026-09-08T00:00:00.000Z",
  },
  {
    slug: "gerber-baby-food",
    title: "Gerber Baby Food",
    sku: "NWB-BF-001",
    brand: "Gerber",
    category: "newborn",
    basePrice: 530,
    salePrice: 480,
    costPrice: 320,
    description:
      "Single-grain rice cereal fortified with iron and vitamins for babies from 6 months. Smooth texture, no artificial colours or flavours.",
    images: ["https://images.unsplash.com/photo-1576426863848-c21f53c60b19?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: true,
    lowStockThreshold: 12,
    batches: [
      { expiresIn: { days: 45 }, quantity: 50 },
      { expiresIn: { months: 8 }, quantity: 80 },
    ],
    createdAt: "2026-09-09T00:00:00.000Z",
  },
  {
    slug: "newborn-clothing-set",
    title: "Newborn Clothing Set",
    sku: "NWB-CL-001",
    brand: "Huggies",
    category: "newborn",
    basePrice: 1150,
    salePrice: 980,
    costPrice: 640,
    description:
      "Five-piece organic cotton starter set: bodysuit, pants, cap, mittens and booties. Pre-washed for softness and sized 0-3 months.",
    images: ["https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: false,
    lowStockThreshold: 8,
    batches: [{ expiresIn: LONG_DATED, quantity: 45 }],
    createdAt: "2026-09-10T00:00:00.000Z",
  },
  {
    slug: "aveeno-baby-wash",
    title: "Aveeno Baby Wash",
    sku: "SKN-BW-001",
    brand: "Aveeno",
    category: "skin-care",
    basePrice: 1500,
    salePrice: 1320,
    costPrice: 880,
    description:
      "Daily moisture wash and shampoo with natural oat extract. Tear-free, soap-free and gentle enough for everyday baths.",
    images: ["/images/test-pexels-3.jpg"], // the previous Unsplash photo was removed upstream (404)
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { months: 8 }, quantity: 45 },
      { expiresIn: { months: 18 }, quantity: 60 },
    ],
    createdAt: "2026-09-11T00:00:00.000Z",
  },
  {
    slug: "prenatal-vitamins",
    title: "Prenatal Vitamins",
    sku: "MTR-VT-002",
    brand: "Cetaphil",
    category: "mother-care",
    basePrice: 2000,
    salePrice: 1650,
    costPrice: 1100,
    description:
      "Once-daily prenatal multivitamin with folic acid, iron, iodine, vitamin D3 and DHA to support a healthy pregnancy. 60 softgels.",
    images: ["/images/prod-vitamins.jpg"],
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { days: 45 }, quantity: 35 },
      { expiresIn: { months: 8 }, quantity: 50 },
      { expiresIn: { months: 18 }, quantity: 70 },
    ],
    createdAt: "2026-09-12T00:00:00.000Z",
  },
  {
    slug: "pampers-baby-dry-pants",
    title: "Pampers Baby-Dry Pants",
    sku: "NWB-DP-003",
    brand: "Pampers",
    category: "newborn",
    basePrice: 1600,
    salePrice: 1390,
    costPrice: 980,
    description:
      "Easy pull-up pant diapers with magic gel channels for overnight dryness and an all-round stretchy waistband for active babies.",
    images: ["/images/prod-diaper.svg"],
    requiresBatchTracking: false,
    lowStockThreshold: 15,
    batches: [{ expiresIn: LONG_DATED, quantity: 100 }],
    createdAt: "2026-09-13T00:00:00.000Z",
  },
  {
    slug: "cetaphil-baby-wash",
    title: "Cetaphil Baby Gentle Wash & Shampoo",
    sku: "SKN-BW-002",
    brand: "Cetaphil",
    category: "skin-care",
    basePrice: 1200,
    salePrice: 990,
    costPrice: 690,
    description:
      "2-in-1 wash and shampoo with organic calendula. Tear-free, hypoallergenic and pH balanced for newborn skin and hair.",
    images: ["https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { months: 8 }, quantity: 40 },
      { expiresIn: { months: 18 }, quantity: 55 },
    ],
    createdAt: "2026-09-14T00:00:00.000Z",
  },
  {
    slug: "huggies-natural-soft-diapers",
    title: "Huggies Natural Soft Diapers",
    sku: "NWB-DP-004",
    brand: "Huggies",
    category: "newborn",
    basePrice: 1550,
    salePrice: 1320,
    costPrice: 930,
    description:
      "Plant-based soft diapers with a breathable outer cover, double leak guards and a pocketed back waistband to contain blowouts.",
    images: ["/images/prod-diaper.svg"],
    requiresBatchTracking: false,
    lowStockThreshold: 15,
    batches: [{ expiresIn: LONG_DATED, quantity: 90 }],
    createdAt: "2026-09-15T00:00:00.000Z",
  },
  {
    slug: "maternity-seamless-bralette-pack",
    title: "Maternity Seamless Bralette Pack",
    sku: "INW-BR-003",
    brand: "Cetaphil",
    category: "inner-wear",
    basePrice: 1800,
    salePrice: 1490,
    costPrice: 1000,
    description:
      "Pack of three seamless, stretchy bralettes that grow with you through pregnancy and nursing. Removable pads and no underwire.",
    images: ["/images/prod-bra.jpg"],
    requiresBatchTracking: false,
    lowStockThreshold: 8,
    batches: [{ expiresIn: LONG_DATED, quantity: 50 }],
    createdAt: "2026-09-16T00:00:00.000Z",
  },
  {
    slug: "postpartum-recovery-support-band",
    title: "Postpartum Recovery Support Band",
    sku: "MTR-BD-001",
    brand: "Mustela",
    category: "mother-care",
    basePrice: 2100,
    salePrice: 1750,
    costPrice: 1200,
    description:
      "Breathable postpartum belly band that supports abdominal muscles and posture after delivery or C-section. Adjustable hook-and-loop closure.",
    images: ["https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=500&auto=format&fit=crop&q=80"],
    requiresBatchTracking: false,
    lowStockThreshold: 5,
    // Deliberately below the threshold to demo LOW_STOCK alerts.
    batches: [{ expiresIn: LONG_DATED, quantity: 3 }],
    createdAt: "2026-09-17T00:00:00.000Z",
  },
  {
    slug: "organic-soothing-nipple-balm",
    title: "Organic Soothing Nipple Balm",
    sku: "MTR-BM-001",
    brand: "Aveeno",
    category: "mother-care",
    basePrice: 850,
    salePrice: 720,
    costPrice: 470,
    description:
      "Lanolin-free organic balm with shea butter and calendula that soothes and protects sore nipples. Safe for baby — no need to wipe off before feeding.",
    images: ["/images/test-pexels-skin.jpg"], // the previous Unsplash photo was removed upstream (404)
    requiresBatchTracking: true,
    lowStockThreshold: 8,
    batches: [
      { expiresIn: { days: 25 }, quantity: 20 },
      { expiresIn: { months: 8 }, quantity: 40 },
    ],
    createdAt: "2026-09-18T00:00:00.000Z",
  },
  // --- Original backend seed products (house brand) ---
  {
    slug: "natural-hydrating-face-wash",
    title: "Natural Hydrating Face Wash",
    sku: "SKN-FW-001",
    brand: "My Oxygen",
    category: "skin-care",
    basePrice: 650,
    costPrice: 420,
    description: "Gentle dermatologically tested organic face cleanser for mothers.",
    images: ["/images/prod-facewash.svg"],
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { days: 45 }, quantity: 50 },
      { expiresIn: { months: 18 }, quantity: 100 },
    ],
    createdAt: "2026-08-20T00:00:00.000Z",
  },
  {
    slug: "ultra-soft-baby-diaper",
    title: "Ultra Soft Baby Diaper (Pants)",
    sku: "NWB-DP-001",
    brand: "My Oxygen",
    category: "newborn",
    basePrice: 850,
    costPrice: 580,
    description: "Breathable feather-soft diaper pants with wetness indicator for newborn comfort.",
    images: ["/images/prod-diaper.jpg"],
    requiresBatchTracking: false,
    lowStockThreshold: 15,
    batches: [{ expiresIn: LONG_DATED, quantity: 150 }],
    createdAt: "2026-08-21T00:00:00.000Z",
  },
  {
    slug: "complete-pregnancy-multivitamin",
    title: "Complete Pregnancy Multivitamin",
    sku: "MTR-VT-001",
    brand: "My Oxygen",
    category: "mother-care",
    basePrice: 1250,
    costPrice: 850,
    description: "Essential prenatal folic acid, iron, and DHA supplement for maternal health.",
    images: ["/images/prod-vitamins.svg"],
    requiresBatchTracking: true,
    lowStockThreshold: 10,
    batches: [
      { expiresIn: { months: 8 }, quantity: 40 },
      { expiresIn: { months: 18 }, quantity: 60 },
    ],
    createdAt: "2026-08-22T00:00:00.000Z",
  },
  {
    slug: "seamless-comfort-nursing-bra",
    title: "Seamless Comfort Nursing Bra",
    sku: "INW-BR-001",
    brand: "My Oxygen",
    category: "inner-wear",
    basePrice: 1100,
    costPrice: 720,
    description: "Soft stretch breathable wire-free support bra designed for daily nursing ease.",
    images: ["/images/test-bra.jpg"],
    requiresBatchTracking: false,
    lowStockThreshold: 8,
    batches: [{ expiresIn: LONG_DATED, quantity: 60 }],
    createdAt: "2026-08-23T00:00:00.000Z",
  },
];

/** Slugs of every product the seed owns (used by tests to ignore other fixtures). */
export const SEEDED_PRODUCT_SLUGS: readonly string[] = PRODUCT_SEED.map((p) => p.slug);
export const SEEDED_CATEGORY_SLUGS: readonly string[] = CATEGORY_SEED.map((c) => c.slug);

interface FlashSaleSeed {
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  productSlug?: string;
  categorySlug?: CategorySlug;
}

/** Automatic, time-boxed flash sales (code IS NULL), active now → +7 days. */
const FLASH_SALE_SEED: ReadonlyArray<FlashSaleSeed> = [
  { name: "Mega Diaper Flash Sale", type: "PERCENTAGE", value: 20, productSlug: "pampers-premium-care-diapers" },
  { name: "Skincare Glow Hour", type: "PERCENTAGE", value: 25, productSlug: "mustela-baby-skincare-set" },
  { name: "Inner Wear Week", type: "PERCENTAGE", value: 15, categorySlug: "inner-wear" },
];

interface CouponSeed {
  code: string;
  name: string;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minOrderAmount: number;
  maxDiscountAmount?: number;
  usageLimit?: number;
  perCustomerLimit?: number;
}

const COUPON_SEED: ReadonlyArray<CouponSeed> = [
  {
    code: "WELCOME10",
    name: "Welcome 10% off your first order",
    type: "PERCENTAGE",
    value: 10,
    minOrderAmount: 500,
    maxDiscountAmount: 500,
    usageLimit: 1000,
    perCustomerLimit: 1,
  },
  {
    code: "FLAT100",
    name: "৳100 off orders over ৳1,500",
    type: "FIXED_AMOUNT",
    value: 100,
    minOrderAmount: 1500,
  },
];

interface UserSeed {
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  password: string;
}

const DEV_ROLE_USERS: ReadonlyArray<Omit<UserSeed, "password">> = [
  { email: "inventory@myoxygen.com", fullName: "Dev Inventory Manager", phone: "01700000001", role: "INVENTORY_MANAGER" },
  { email: "orders@myoxygen.com", fullName: "Dev Order Manager", phone: "01700000002", role: "ORDER_MANAGER" },
  { email: "marketing@myoxygen.com", fullName: "Dev Marketing Manager", phone: "01700000003", role: "MARKETING_MANAGER" },
  { email: "support@myoxygen.com", fullName: "Dev Support Staff", phone: "01700000004", role: "SUPPORT_STAFF" },
  { email: "customer@myoxygen.com", fullName: "Demo Customer", phone: "01700000005", role: "CUSTOMER" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** `excluded."column"` for ON CONFLICT DO UPDATE SET clauses. */
const excluded = (column: AnyColumn) => sql.raw(`excluded."${column.name}"`);
/** `(xmax = 0)` in RETURNING is true for freshly inserted rows, false for updated ones. */
const wasInserted = sql<boolean>`(xmax = 0)`;

const money = (value: number): string => value.toFixed(2);

export interface SeedSummary {
  categories: { inserted: number; updated: number };
  users: { inserted: number; updated: number; accounts: Array<{ email: string; role: UserRole }> };
  products: { inserted: number; updated: number };
  batches: { inserted: number; skipped: number; expiringSoon: number };
  stockLedgerRows: number;
  discounts: { inserted: number; updated: number };
  adminPasswordSource: "SEED_ADMIN_PASSWORD" | "documented dev default";
  demoCatalog: boolean;
}

/** Demo products, batches and discounts are opt-in in production (SEED_DEMO_CATALOG). */
function shouldSeedDemoCatalog(): boolean {
  return env.SEED_DEMO_CATALOG ?? env.NODE_ENV !== "production";
}

function resolveAdminCredentials(): { email: string; password: string; source: SeedSummary["adminPasswordSource"] } {
  const isProduction = env.NODE_ENV === "production";
  if (isProduction && (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD)) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required to seed in production.");
  }
  return {
    email: (env.SEED_ADMIN_EMAIL ?? DEV_ADMIN_EMAIL).toLowerCase(),
    password: env.SEED_ADMIN_PASSWORD ?? DEV_ADMIN_PASSWORD,
    source: env.SEED_ADMIN_PASSWORD ? "SEED_ADMIN_PASSWORD" : "documented dev default",
  };
}

async function seedCategories(tx: DatabaseTransaction): Promise<{ ids: Map<CategorySlug, string>; inserted: number; updated: number }> {
  const rows = await tx
    .insert(categories)
    .values(CATEGORY_SEED.map((c) => ({ ...c })))
    .onConflictDoUpdate({
      target: categories.slug,
      set: {
        name: excluded(categories.name),
        iconUrl: excluded(categories.iconUrl),
        sortOrder: excluded(categories.sortOrder),
        updatedAt: new Date(),
      },
    })
    .returning({ id: categories.id, slug: categories.slug, inserted: wasInserted });

  const ids = new Map<CategorySlug, string>();
  for (const row of rows) ids.set(row.slug as CategorySlug, row.id);
  const inserted = rows.filter((r) => r.inserted).length;
  return { ids, inserted, updated: rows.length - inserted };
}

async function seedUsers(
  tx: DatabaseTransaction,
  seeds: ReadonlyArray<UserSeed & { passwordHash: string }>,
): Promise<{ adminId: string; inserted: number; updated: number }> {
  let inserted = 0;
  let updated = 0;
  let adminId: string | undefined;

  for (const seed of seeds) {
    const [existing] = await tx
      .select({ id: users.id, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, seed.email))
      .limit(1);

    if (!existing) {
      const [row] = await tx
        .insert(users)
        .values({
          email: seed.email,
          fullName: seed.fullName,
          phone: seed.phone,
          role: seed.role,
          passwordHash: seed.passwordHash,
          isActive: true,
        })
        .returning({ id: users.id });
      inserted++;
      if (seed.role === "SUPER_ADMIN") adminId = row?.id;
      continue;
    }

    // Only re-hash when the configured password actually changed.
    const passwordUnchanged =
      existing.passwordHash !== null && (await bcrypt.compare(seed.password, existing.passwordHash));
    await tx
      .update(users)
      .set({
        fullName: seed.fullName,
        role: seed.role,
        isActive: true,
        ...(passwordUnchanged ? {} : { passwordHash: seed.passwordHash }),
      })
      .where(eq(users.id, existing.id));
    updated++;
    if (seed.role === "SUPER_ADMIN") adminId = existing.id;
  }

  if (!adminId) throw new Error("Super admin was not seeded");
  return { adminId, inserted, updated };
}

async function seedProducts(
  tx: DatabaseTransaction,
  categoryIds: Map<CategorySlug, string>,
): Promise<{ ids: Map<string, string>; inserted: number; updated: number }> {
  const values = PRODUCT_SEED.map((p) => {
    const categoryId = categoryIds.get(p.category);
    if (!categoryId) throw new Error(`Unknown category ${p.category} for ${p.slug}`);
    return {
      categoryId,
      title: p.title,
      slug: p.slug,
      sku: p.sku,
      brand: p.brand,
      description: p.description,
      basePrice: money(p.basePrice),
      costPrice: money(p.costPrice),
      images: p.images,
      requiresBatchTracking: p.requiresBatchTracking,
      lowStockThreshold: p.lowStockThreshold,
      createdAt: new Date(p.createdAt),
    };
  });

  const rows = await tx
    .insert(products)
    .values(values)
    .onConflictDoUpdate({
      target: products.slug,
      set: {
        categoryId: excluded(products.categoryId),
        title: excluded(products.title),
        sku: excluded(products.sku),
        brand: excluded(products.brand),
        description: excluded(products.description),
        basePrice: excluded(products.basePrice),
        costPrice: excluded(products.costPrice),
        // A cost breakdown must always sum to cost_price: drop it when the seed changes the cost.
        costBreakdown: sql`CASE WHEN ${sql.raw(`"products"."cost_price"`)} = ${excluded(products.costPrice)} THEN ${sql.raw(`"products"."cost_breakdown"`)} ELSE NULL END`,
        images: excluded(products.images),
        requiresBatchTracking: excluded(products.requiresBatchTracking),
        lowStockThreshold: excluded(products.lowStockThreshold),
        updatedAt: new Date(),
      },
    })
    .returning({ id: products.id, slug: products.slug, inserted: wasInserted });

  const ids = new Map<string, string>();
  for (const row of rows) ids.set(row.slug, row.id);
  const inserted = rows.filter((r) => r.inserted).length;
  return { ids, inserted, updated: rows.length - inserted };
}

async function seedBatches(
  tx: DatabaseTransaction,
  productIds: Map<string, string>,
  actorId: string,
): Promise<{ inserted: number; skipped: number; expiringSoon: number; ledgerRows: number }> {
  const today = todayIn(env.APP_TIMEZONE);
  const expiringSoonLimit = shiftDate(today, { days: 30 });

  const values = PRODUCT_SEED.flatMap((p) => {
    const productId = productIds.get(p.slug);
    if (!productId) throw new Error(`Product ${p.slug} was not seeded`);
    return p.batches.map((b, index) => {
      const expiry = shiftDate(today, b.expiresIn);
      // Shelf life: 24 months for perishables, made a month ago for long-dated goods.
      const manufacture = p.requiresBatchTracking
        ? shiftDate(expiry, { months: -24 })
        : shiftDate(today, { days: -30 });
      return {
        productId,
        batchNumber: `${p.sku}-B${index + 1}`,
        manufactureDate: isoDate(manufacture),
        expiryDate: isoDate(expiry),
        initialQuantity: b.quantity,
        availableQuantity: b.quantity,
      };
    });
  });

  const insertedRows = await tx
    .insert(productBatches)
    .values(values)
    .onConflictDoNothing({ target: [productBatches.productId, productBatches.batchNumber] })
    .returning({
      id: productBatches.id,
      productId: productBatches.productId,
      batchNumber: productBatches.batchNumber,
      expiryDate: productBatches.expiryDate,
      initialQuantity: productBatches.initialQuantity,
    });

  if (insertedRows.length > 0) {
    await tx.insert(stockHistoryLogs).values(
      insertedRows.map((b) => ({
        productId: b.productId,
        batchId: b.id,
        changeDelta: b.initialQuantity,
        balanceAfter: b.initialQuantity,
        reason: "IMPORT" as const,
        note: `Seed import of batch ${b.batchNumber}`,
        performedByUserId: actorId,
      })),
    );
  }

  const expiringSoon = insertedRows.filter((b) => new Date(`${b.expiryDate}T00:00:00.000Z`) <= expiringSoonLimit).length;
  return {
    inserted: insertedRows.length,
    skipped: values.length - insertedRows.length,
    expiringSoon,
    ledgerRows: insertedRows.length,
  };
}

interface DiscountRow {
  name: string;
  code: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: string;
  productId: string | null;
  categoryId: string | null;
  minOrderAmount: string | null;
  maxDiscountAmount: string | null;
  usageLimit: number | null;
  perCustomerLimit: number | null;
  startsAt: Date;
  endsAt: Date;
  isFlashSale: boolean;
}

async function seedDiscounts(
  tx: DatabaseTransaction,
  productIds: Map<string, string>,
  categoryIds: Map<CategorySlug, string>,
): Promise<{ inserted: number; updated: number }> {
  const now = new Date();
  const startsAt = new Date(now.getTime() - 60 * 60 * 1000); // active immediately
  const productId = (slug: string): string => {
    const id = productIds.get(slug);
    if (!id) throw new Error(`Unknown product ${slug}`);
    return id;
  };
  const categoryId = (slug: CategorySlug): string => {
    const id = categoryIds.get(slug);
    if (!id) throw new Error(`Unknown category ${slug}`);
    return id;
  };

  const rows: DiscountRow[] = [];

  // Regular storefront sale prices: automatic product discounts (basePrice → salePrice).
  for (const p of PRODUCT_SEED) {
    if (p.salePrice === undefined || p.salePrice >= p.basePrice) continue;
    rows.push({
      name: `Sale price: ${p.title}`,
      code: null,
      type: "FIXED_AMOUNT",
      value: money(p.basePrice - p.salePrice),
      productId: productId(p.slug),
      categoryId: null,
      minOrderAmount: null,
      maxDiscountAmount: null,
      usageLimit: null,
      perCustomerLimit: null,
      startsAt,
      endsAt: shiftDate(now, { months: 6 }),
      isFlashSale: false,
    });
  }

  for (const f of FLASH_SALE_SEED) {
    rows.push({
      name: f.name,
      code: null,
      type: f.type,
      value: money(f.value),
      productId: f.productSlug ? productId(f.productSlug) : null,
      categoryId: f.categorySlug ? categoryId(f.categorySlug) : null,
      minOrderAmount: null,
      maxDiscountAmount: null,
      usageLimit: null,
      perCustomerLimit: null,
      startsAt,
      endsAt: shiftDate(now, { days: 7 }),
      isFlashSale: true,
    });
  }

  for (const c of COUPON_SEED) {
    rows.push({
      name: c.name,
      code: c.code,
      type: c.type,
      value: money(c.value),
      productId: null,
      categoryId: null,
      minOrderAmount: money(c.minOrderAmount),
      maxDiscountAmount: c.maxDiscountAmount === undefined ? null : money(c.maxDiscountAmount),
      usageLimit: c.usageLimit ?? null,
      perCustomerLimit: c.perCustomerLimit ?? null,
      startsAt,
      endsAt: shiftDate(now, { months: 12 }),
      isFlashSale: false,
    });
  }

  // Natural keys: coupons by lower(code), automatic discounts by name.
  const codes = rows.flatMap((r) => (r.code ? [r.code.toLowerCase()] : []));
  const names = rows.filter((r) => r.code === null).map((r) => r.name);
  const existing = await tx
    .select({ id: discounts.id, code: discounts.code, name: discounts.name })
    .from(discounts)
    .where(
      or(
        and(isNotNull(discounts.code), inArray(sql`lower(${discounts.code})`, codes)),
        and(isNull(discounts.code), inArray(discounts.name, names)),
      ),
    );
  const byCode = new Map(existing.filter((e) => e.code).map((e) => [e.code?.toLowerCase() ?? "", e.id]));
  const byName = new Map(existing.filter((e) => !e.code && e.name).map((e) => [e.name ?? "", e.id]));

  let inserted = 0;
  let updated = 0;
  const toInsert: DiscountRow[] = [];
  for (const row of rows) {
    const id = row.code ? byCode.get(row.code.toLowerCase()) : byName.get(row.name);
    if (!id) {
      toInsert.push(row);
      continue;
    }
    // Refresh the window so re-seeding never leaves expired demo fixtures; keep usage counters.
    await tx
      .update(discounts)
      .set({ ...row, isActive: true })
      .where(eq(discounts.id, id));
    updated++;
  }
  if (toInsert.length > 0) {
    await tx.insert(discounts).values(toInsert.map((r) => ({ ...r, isActive: true })));
    inserted = toInsert.length;
  }
  return { inserted, updated };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function seed(): Promise<SeedSummary> {
  const admin = resolveAdminCredentials();
  const includeDevUsers = env.NODE_ENV !== "production";

  const userSeeds: UserSeed[] = [
    { email: admin.email, fullName: "System Super Admin", phone: "01700000000", role: "SUPER_ADMIN", password: admin.password },
    ...(includeDevUsers ? DEV_ROLE_USERS.map((u) => ({ ...u, password: DEV_STAFF_PASSWORD })) : []),
  ];
  // Hash outside the transaction to keep it short.
  const hashedUsers = await Promise.all(
    userSeeds.map(async (u) => ({ ...u, passwordHash: await bcrypt.hash(u.password, BCRYPT_ROUNDS) })),
  );

  const demoCatalog = shouldSeedDemoCatalog();

  return db.transaction(async (tx) => {
    const cats = await seedCategories(tx);
    const usersResult = await seedUsers(tx, hashedUsers);

    if (!demoCatalog) {
      return {
        categories: { inserted: cats.inserted, updated: cats.updated },
        users: {
          inserted: usersResult.inserted,
          updated: usersResult.updated,
          accounts: userSeeds.map((u) => ({ email: u.email, role: u.role })),
        },
        products: { inserted: 0, updated: 0 },
        batches: { inserted: 0, skipped: 0, expiringSoon: 0 },
        stockLedgerRows: 0,
        discounts: { inserted: 0, updated: 0 },
        adminPasswordSource: admin.source,
        demoCatalog,
      };
    }

    const prods = await seedProducts(tx, cats.ids);
    const batches = await seedBatches(tx, prods.ids, usersResult.adminId);
    const discountResult = await seedDiscounts(tx, prods.ids, cats.ids);

    return {
      categories: { inserted: cats.inserted, updated: cats.updated },
      users: {
        inserted: usersResult.inserted,
        updated: usersResult.updated,
        accounts: userSeeds.map((u) => ({ email: u.email, role: u.role })),
      },
      products: { inserted: prods.inserted, updated: prods.updated },
      batches: { inserted: batches.inserted, skipped: batches.skipped, expiringSoon: batches.expiringSoon },
      stockLedgerRows: batches.ledgerRows,
      discounts: discountResult,
      adminPasswordSource: admin.source,
      demoCatalog,
    };
  });
}

function printSummary(summary: SeedSummary): void {
  const lines = [
    "Seed completed",
    `  categories     inserted ${summary.categories.inserted}, updated ${summary.categories.updated}`,
    `  users          inserted ${summary.users.inserted}, updated ${summary.users.updated}`,
    ...summary.users.accounts.map((a) => `                 - ${a.email} (${a.role})`),
    `  admin password source: ${summary.adminPasswordSource}`,
    `  demo catalog   ${summary.demoCatalog ? "seeded" : "skipped (SEED_DEMO_CATALOG)"}`,
    `  products       inserted ${summary.products.inserted}, updated ${summary.products.updated}`,
    `  batches        inserted ${summary.batches.inserted}, already present ${summary.batches.skipped}` +
      ` (${summary.batches.expiringSoon} new batch(es) expire within 30 days)`,
    `  stock ledger   ${summary.stockLedgerRows} IMPORT row(s)`,
    `  discounts      inserted ${summary.discounts.inserted}, updated ${summary.discounts.updated}`,
  ];
  console.log(lines.join("\n"));
}

if (import.meta.main) {
  seed()
    .then(printSummary)
    .then(() => closeDb())
    .catch(async (error: unknown) => {
      console.error("Seed failed:", error instanceof Error ? error.message : String(error));
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
