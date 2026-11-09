/**
 * Demo sales history for visual QA of the admin dashboards and reports.
 * LOCAL DATABASES ONLY.
 *
 *   # from backend/, against the local test cluster (bun loads .env.test):
 *   NODE_ENV=test bun run db:seed:demo-history
 *   # or any local database with explicit settings:
 *   DATABASE_URL=postgresql://postgres@localhost:54329/my_oxygen_test JWT_SECRET=<32+ chars> bun run db:seed:demo-history
 *
 * Safety: refuses NODE_ENV=production, and refuses any DATABASE_URL whose host
 * is not localhost / 127.0.0.1 / ::1 unless `--allow-remote` is passed
 * explicitly. Prerequisite: `bun run db:seed` (catalog, coupons, admin).
 *
 * What it creates (idempotent; demo rows are recognisable):
 *  - ~40 customers with Bangladeshi names/phones, e-mail `…@demo.myoxygen.local`,
 *    sign-ups spread over the last 8 months (a few this week, one today);
 *  - ~170–190 orders over the last 8 months (denser recently, including the
 *    last 7 days and today) placed through the REAL order service, so FEFO
 *    allocation, stock, the ledger and `order_items.unit_cost` stay
 *    consistent; demo batches (`DEMO-<sku>-n`) are imported first whenever
 *    stock would run out. Orders are then moved through the real status
 *    service (mostly DELIVERED/PAID, some SHIPPED/PROCESSING/PENDING, a few
 *    CANCELLED/REFUNDED; online payments marked PAID, failed ones FAILED) and
 *    finally backdated: created_at, order number date, status history,
 *    shipped/delivered/cancelled timestamps and the related ledger rows;
 *  - a cost breakdown on every seeded product (components sum to its cost price);
 *  - ~40 expenses across the 8 months (note "Demo seed · …");
 *  - low stock on 4 products (manual adjustments) so inventory alerts show.
 * Re-running skips the orders/expenses phases when demo rows already exist.
 */
import { and, asc, desc, eq, gt, inArray, like, sql } from "drizzle-orm";
import { closeDb, db } from "../src/db/client";
import { databaseHost, isLocalDatabaseHost } from "../src/db/connection";
import { SEEDED_PRODUCT_SLUGS } from "../src/db/seed";
import {
  expenses,
  orderItems,
  orders,
  orderStatusHistory,
  productBatches,
  products,
  stockHistoryLogs,
  users,
  type CostBreakdown,
} from "../src/db/schema/tables";
import { env } from "../src/env";
import { addDays, businessDate, todayInBusinessTz } from "../src/lib/dates";
import { AppError } from "../src/lib/errors";
import { expenseService, type ExpenseCategory } from "../src/services/expense.service";
import { inventoryService } from "../src/services/inventory.service";
import type { OrderDetailDTO, PaymentMethod } from "../src/services/order-dto";
import type { OrderStatus } from "../src/services/order-state-machine";
import { orderStatusService } from "../src/services/order-status.service";
import { orderService, type OrderViewer } from "../src/services/order.service";
import { productService } from "../src/services/product.service";
import type { ShippingAddress } from "../src/types";

// ---------------------------------------------------------------------------
// Safety guard (runs before any query)
// ---------------------------------------------------------------------------

const allowRemote = Bun.argv.includes("--allow-remote");
if (env.NODE_ENV === "production") {
  console.error("seed-demo-history: refusing to run with NODE_ENV=production.");
  process.exit(1);
}
if (!isLocalDatabaseHost(env.DATABASE_URL) && !allowRemote) {
  console.error(
    `seed-demo-history: refusing non-local database host "${databaseHost(env.DATABASE_URL) ?? "unparseable"}". ` +
      "Demo data is for local databases only (pass --allow-remote only if you really mean it).",
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Deterministic randomness and time helpers
// ---------------------------------------------------------------------------

const HISTORY_DAYS = 240; // ~8 months
const DEMO_EMAIL_DOMAIN = "demo.myoxygen.local";
const DEMO_EXPENSE_NOTE = "Demo seed";
const HOUR_MS = 60 * 60 * 1000;

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(20_260_926);
const between = (min: number, max: number): number => min + random() * (max - min);
const intBetween = (min: number, max: number): number => Math.floor(between(min, max + 1));
const chance = (p: number): boolean => random() < p;

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error("pick() from an empty list");
  return item;
}

function weightedPick<T>(items: ReadonlyArray<{ item: T; weight: number }>): T {
  const total = items.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = random() * total;
  for (const entry of items) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  const last = items.at(-1);
  if (last === undefined) throw new Error("weightedPick() from an empty list");
  return last.item;
}

function poisson(lambda: number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k += 1;
    p *= random();
  } while (p > limit);
  return k - 1;
}

/** Offset (ms) of `timeZone` from UTC at `instant`. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(value("year"), value("month") - 1, value("day"), value("hour"), value("minute"), value("second"));
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** Instant of `minutesOfDay` on business date `date` in APP_TIMEZONE. */
function businessInstant(date: string, minutesOfDay: number): Date {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const guess = Date.UTC(year, month - 1, day, 0, minutesOfDay);
  return new Date(guess - timeZoneOffsetMs(new Date(guess), env.APP_TIMEZONE));
}

// ---------------------------------------------------------------------------
// Static demo vocabulary
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  "Ayesha", "Nusrat", "Sadia", "Tasnim", "Farhana", "Sumaiya", "Rumana", "Jannatul", "Mithila", "Sharmin",
  "Tahmina", "Nafisa", "Shirin", "Rokeya", "Lamia", "Anika", "Marium", "Fatema", "Sabina", "Moushumi",
  "Rafiq", "Tanvir", "Imran", "Sakib", "Mahmud", "Arif", "Shafiq", "Nayeem", "Fahim", "Rashed",
] as const;
const LAST_NAMES = [
  "Rahman", "Akter", "Begum", "Hossain", "Islam", "Khatun", "Chowdhury", "Ahmed", "Sultana", "Karim",
  "Haque", "Uddin", "Sarkar", "Talukder", "Siddique", "Mia", "Bhuiyan", "Molla", "Sheikh", "Jahan",
] as const;

interface DistrictInfo {
  district: string;
  city: string;
  postalCode: string;
  areas: readonly string[];
  weight: number;
}

const DISTRICTS: readonly DistrictInfo[] = [
  { district: "Dhaka", city: "Dhaka", postalCode: "1207", areas: ["Dhanmondi", "Mirpur", "Uttara", "Mohammadpur", "Banani", "Bashundhara"], weight: 38 },
  { district: "Chattogram", city: "Chattogram", postalCode: "4000", areas: ["Agrabad", "Nasirabad", "Halishahar", "Khulshi"], weight: 14 },
  { district: "Gazipur", city: "Gazipur", postalCode: "1700", areas: ["Tongi", "Joydebpur", "Konabari"], weight: 8 },
  { district: "Narayanganj", city: "Narayanganj", postalCode: "1400", areas: ["Chashara", "Fatullah", "Siddhirganj"], weight: 7 },
  { district: "Sylhet", city: "Sylhet", postalCode: "3100", areas: ["Zindabazar", "Amberkhana", "Uposhohor"], weight: 7 },
  { district: "Rajshahi", city: "Rajshahi", postalCode: "6000", areas: ["Shaheb Bazar", "Uposhohor", "Kazla"], weight: 5 },
  { district: "Khulna", city: "Khulna", postalCode: "9100", areas: ["Sonadanga", "Khalishpur", "Boyra"], weight: 5 },
  { district: "Cumilla", city: "Cumilla", postalCode: "3500", areas: ["Kandirpar", "Tomsom Bridge", "Ranir Bazar"], weight: 5 },
  { district: "Mymensingh", city: "Mymensingh", postalCode: "2200", areas: ["Ganginarpar", "Charpara"], weight: 4 },
  { district: "Barishal", city: "Barishal", postalCode: "8200", areas: ["Sadar Road", "Nathullabad"], weight: 3 },
  { district: "Rangpur", city: "Rangpur", postalCode: "5400", areas: ["Jahaj Company More", "Dhap"], weight: 2 },
  { district: "Bogura", city: "Bogura", postalCode: "5800", areas: ["Satmatha", "Sherpur Road"], weight: 2 },
];

interface ExpensePlan {
  category: ExpenseCategory;
  vendors: readonly string[];
  min: number;
  max: number;
  /** Number of the 8 months that get one entry. */
  months: number;
  label: string;
}

const EXPENSE_PLANS: readonly ExpensePlan[] = [
  { category: "MARKETING", vendors: ["Meta Ads", "Google Ads", "Daraz Sponsored"], min: 1500, max: 3500, months: 8, label: "Online ads" },
  { category: "SHIPPING", vendors: ["Steadfast Courier", "Pathao Courier"], min: 900, max: 1800, months: 8, label: "Courier charges" },
  { category: "PACKAGING", vendors: ["Dhaka Packaging House", "Box & Bag Ltd."], min: 400, max: 900, months: 8, label: "Boxes and mailer bags" },
  { category: "UTILITIES", vendors: ["DESCO", "Link3 Internet"], min: 500, max: 900, months: 4, label: "Electricity / internet" },
  { category: "RENT", vendors: ["Mirpur storage room"], min: 1500, max: 1500, months: 4, label: "Storage space" },
  { category: "DELIVERY_SUBSIDY", vendors: ["Free-delivery campaign"], min: 300, max: 700, months: 3, label: "Free delivery promo" },
  { category: "SALARIES", vendors: ["Part-time packer"], min: 2000, max: 2500, months: 3, label: "Packing help" },
  { category: "OTHER", vendors: ["Misc."], min: 250, max: 600, months: 2, label: "Miscellaneous" },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DemoCustomer {
  id: string;
  fullName: string;
  phone: string;
  createdAt: Date;
  address: ShippingAddress;
  weight: number;
}

interface DemoProduct {
  id: string;
  sku: string;
  title: string;
  weight: number;
}

type Outcome = "DELIVERED" | "CANCELLED" | "REFUNDED";

interface Summary {
  customersCreated: number;
  customersTotal: number;
  costBreakdowns: number;
  ordersCreated: number;
  ordersByStatus: Partial<Record<OrderStatus, number>>;
  ordersSkipped: number;
  batchesImported: number;
  expensesCreated: number;
  lowStockAdjusted: number;
}

// ---------------------------------------------------------------------------
// Phases
// ---------------------------------------------------------------------------

async function findAdmin(): Promise<OrderViewer> {
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.role, "SUPER_ADMIN"), eq(users.isActive, true)))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!admin) throw new Error("No active SUPER_ADMIN found. Run `bun run db:seed` first.");
  return { id: admin.id, role: "SUPER_ADMIN" };
}

const CUSTOMER_COUNT = 40;
/** Sign-ups of the newest 4 demo customers: this week, ending today. */
const RECENT_SIGNUP_DAYS_AGO = [5, 3, 1, 0] as const;

/** Days before today customer `index` signed up: 8 early adopters, a spread, then 4 this week. */
function signupDaysAgo(index: number): number {
  if (index < 8) return HISTORY_DAYS + 5 - index;
  const recent = index - (CUSTOMER_COUNT - RECENT_SIGNUP_DAYS_AGO.length);
  if (recent >= 0) return RECENT_SIGNUP_DAYS_AGO[recent] ?? 0;
  const spreadCount = CUSTOMER_COUNT - 8 - RECENT_SIGNUP_DAYS_AGO.length;
  return Math.round(HISTORY_DAYS - 10 - ((index - 8) * (HISTORY_DAYS - 18)) / Math.max(spreadCount - 1, 1));
}

async function ensureCustomers(today: string, now: Date, summary: Summary): Promise<DemoCustomer[]> {
  const rows: Array<typeof users.$inferInsert> = [];
  for (let index = 0; index < CUSTOMER_COUNT; index++) {
    const first = FIRST_NAMES[index % FIRST_NAMES.length] ?? "Demo";
    const last = LAST_NAMES[(index * 7) % LAST_NAMES.length] ?? "Customer";
    const daysAgo = signupDaysAgo(index);
    const planned = businessInstant(addDays(today, -daysAgo), 9 * 60 + ((index * 37) % 660));
    // Never in the future (e.g. when the script runs early in the morning).
    const createdAt = new Date(Math.min(planned.getTime(), now.getTime() - 2 * HOUR_MS));
    rows.push({
      fullName: `${first} ${last}`,
      email: `${first}.${last}.${index + 1}@${DEMO_EMAIL_DOMAIN}`.toLowerCase(),
      phone: `01${3 + (index % 7)}${String(70_000_000 + index * 104_729).padStart(8, "0").slice(-8)}`,
      role: "CUSTOMER",
      passwordHash: null,
      isActive: true,
      createdAt,
      updatedAt: createdAt,
    });
  }
  const inserted = await db.insert(users).values(rows).onConflictDoNothing().returning({ id: users.id });
  summary.customersCreated = inserted.length;

  const existing = await db
    .select({ id: users.id, fullName: users.fullName, phone: users.phone, createdAt: users.createdAt, email: users.email })
    .from(users)
    .where(like(users.email, `%@${DEMO_EMAIL_DOMAIN}`))
    .orderBy(asc(users.createdAt));
  summary.customersTotal = existing.length;

  return existing.map((row, index) => {
    const district = weightedPick(DISTRICTS.map((item) => ({ item, weight: item.weight })));
    return {
      id: row.id,
      fullName: row.fullName,
      phone: row.phone,
      createdAt: row.createdAt,
      // Loyal early customers order more often (returning-customer metrics).
      weight: index < 10 ? 5 : 1,
      address: {
        fullName: row.fullName,
        phone: row.phone,
        addressLine1: `House ${intBetween(1, 120)}, Road ${intBetween(1, 30)}, ${pick(district.areas)}`,
        city: district.city,
        district: district.district,
        postalCode: district.postalCode,
      },
    };
  });
}

/** Splits each seeded product's cost price into a landed-cost breakdown (sums exactly). */
async function ensureCostBreakdowns(summary: Summary): Promise<void> {
  const rows = await db
    .select({ id: products.id, costPrice: products.costPrice })
    .from(products)
    .where(inArray(products.slug, [...SEEDED_PRODUCT_SLUGS]));
  for (const row of rows) {
    const totalPaisa = Math.round(Number(row.costPrice) * 100);
    const supplier = Math.round(totalPaisa * 0.78);
    const shipping = Math.round(totalPaisa * 0.08);
    const customs = Math.round(totalPaisa * 0.07);
    const packaging = Math.round(totalPaisa * 0.04);
    const other = totalPaisa - supplier - shipping - customs - packaging;
    const breakdown: CostBreakdown = {
      supplierPrice: supplier / 100,
      shipping: shipping / 100,
      customsDuty: customs / 100,
      packaging: packaging / 100,
      other: Math.max(0, other) / 100,
    };
    await productService.updateProduct(row.id, { costBreakdown: breakdown });
    summary.costBreakdowns += 1;
  }
}

async function sellableProducts(): Promise<DemoProduct[]> {
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      title: products.title,
      isActive: products.isActive,
      autoDeactivatedAt: products.autoDeactivatedAt,
    })
    .from(products)
    .where(inArray(products.slug, [...SEEDED_PRODUCT_SLUGS]))
    .orderBy(asc(products.sku));
  return rows
    .filter((row) => row.isActive || row.autoDeactivatedAt !== null)
    .map((row, index) => ({ id: row.id, sku: row.sku, title: row.title, weight: 1 + ((index * 7) % 5) }));
}

/** Imports a DEMO batch when the product cannot cover `quantity` (+ a small buffer). */
async function ensureStock(product: DemoProduct, quantity: number, admin: OrderViewer, today: string, summary: Summary): Promise<void> {
  const available = await inventoryService.getTotalAvailableStock(product.id);
  if (available >= quantity + 3) return;
  const [{ value: existing } = { value: 0 }] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(productBatches)
    .where(and(eq(productBatches.productId, product.id), like(productBatches.batchNumber, "DEMO-%")));
  const batchNumber = `DEMO-${product.sku}-${existing + 1}`;
  const result = await inventoryService.importBatch(
    {
      productId: product.id,
      batchNumber,
      manufactureDate: addDays(today, -(HISTORY_DAYS + 30)),
      expiryDate: addDays(today, 540),
      initialQuantity: 80,
      note: "Demo seed restock",
    },
    admin.id,
  );
  // The restock belongs to the start of the demo history.
  const importedAt = businessInstant(addDays(today, -HISTORY_DAYS - 2), 11 * 60);
  await db.update(productBatches).set({ createdAt: importedAt, updatedAt: importedAt }).where(eq(productBatches.id, result.batch.id));
  await db.update(stockHistoryLogs).set({ createdAt: importedAt }).where(eq(stockHistoryLogs.id, result.ledgerEntryId));
  summary.batchesImported += 1;
}

interface PlannedOrder {
  at: Date;
  outcome: Outcome;
  cancelFromProcessing: boolean;
  paymentMethod: PaymentMethod;
  tryCoupon: boolean;
}

function planOrders(today: string, now: Date): PlannedOrder[] {
  const planned: PlannedOrder[] = [];
  for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const lambda = daysAgo <= 6 ? 2.6 : daysAgo <= 29 ? 1.5 : daysAgo <= 89 ? 0.8 : 0.5;
    let count = poisson(lambda);
    if (daysAgo <= 6) count = Math.max(count, daysAgo === 0 ? 3 : 2);
    const date = addDays(today, -daysAgo);
    for (let i = 0; i < count; i++) {
      let at = businessInstant(date, intBetween(9 * 60, 22 * 60 + 59));
      if (at.getTime() > now.getTime() - 15 * 60 * 1000) {
        // Today: keep every order in the past (spread over the elapsed hours).
        const start = businessInstant(date, 0).getTime();
        at = new Date(start + random() * Math.max(now.getTime() - 20 * 60 * 1000 - start, 60_000));
      }
      const roll = random();
      planned.push({
        at,
        outcome: roll < 0.86 ? "DELIVERED" : roll < 0.95 ? "CANCELLED" : "REFUNDED",
        cancelFromProcessing: chance(0.5),
        paymentMethod: chance(0.15) ? "ONLINE_GATEWAY" : "COD",
        tryCoupon: chance(0.1),
      });
    }
  }
  return planned.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Status steps with their timestamps, truncated at "now". */
function timeline(plan: PlannedOrder, now: Date): Array<{ status: OrderStatus; at: Date }> {
  const t0 = plan.at.getTime();
  const processing = t0 + between(1, 5) * HOUR_MS;
  const steps: Array<{ status: OrderStatus; at: number }> = [];
  if (plan.outcome === "CANCELLED") {
    if (plan.cancelFromProcessing) {
      steps.push({ status: "PROCESSING", at: processing });
      steps.push({ status: "CANCELLED", at: processing + between(1, 6) * HOUR_MS });
    } else {
      steps.push({ status: "CANCELLED", at: t0 + between(0.5, 4) * HOUR_MS });
    }
  } else {
    const shipped = processing + between(10, 30) * HOUR_MS;
    const delivered = shipped + between(20, 60) * HOUR_MS;
    steps.push({ status: "PROCESSING", at: processing });
    steps.push({ status: "SHIPPED", at: shipped });
    steps.push({ status: "DELIVERED", at: delivered });
    if (plan.outcome === "REFUNDED") steps.push({ status: "REFUNDED", at: delivered + between(48, 120) * HOUR_MS });
  }
  const cutoff = now.getTime() - 10 * 60 * 1000;
  const reached: Array<{ status: OrderStatus; at: Date }> = [];
  for (const step of steps) {
    if (step.at > cutoff) break;
    reached.push({ status: step.status, at: new Date(step.at) });
  }
  return reached;
}

async function createOrders(
  customers: DemoCustomer[],
  catalog: DemoProduct[],
  admin: OrderViewer,
  today: string,
  summary: Summary,
): Promise<void> {
  const [existing] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(like(users.email, `%@${DEMO_EMAIL_DOMAIN}`));
  if ((existing?.value ?? 0) > 0) {
    summary.ordersSkipped = existing?.value ?? 0;
    return;
  }

  const now = new Date();
  const plans = planOrders(today, now);
  for (const plan of plans) {
    const eligible = customers.filter((customer) => customer.createdAt.getTime() <= plan.at.getTime() - 30 * 60 * 1000);
    const customer = weightedPick((eligible.length > 0 ? eligible : customers.slice(0, 1)).map((item) => ({ item, weight: item.weight })));

    const lineCount = weightedPick([
      { item: 1, weight: 55 },
      { item: 2, weight: 30 },
      { item: 3, weight: 15 },
    ]);
    const lines = new Map<string, { product: DemoProduct; quantity: number }>();
    while (lines.size < Math.min(lineCount, catalog.length)) {
      const product = weightedPick(catalog.map((item) => ({ item, weight: item.weight })));
      if (lines.has(product.id)) continue;
      lines.set(product.id, { product, quantity: weightedPick([{ item: 1, weight: 60 }, { item: 2, weight: 30 }, { item: 3, weight: 10 }]) });
    }
    for (const line of lines.values()) await ensureStock(line.product, line.quantity, admin, today, summary);

    const viewer: OrderViewer = { id: customer.id, role: "CUSTOMER" };
    const input = {
      items: [...lines.values()].map((line) => ({ productId: line.product.id, quantity: line.quantity })),
      shippingAddress: customer.address,
      paymentMethod: plan.paymentMethod,
    };
    let order: OrderDetailDTO;
    try {
      order = await orderService.placeOrder(plan.tryCoupon ? { ...input, couponCode: "FLAT100" } : input, viewer);
    } catch (error) {
      if (!(error instanceof AppError) || error.code !== "INVALID_COUPON") throw error;
      order = await orderService.placeOrder(input, viewer);
    }

    const steps = timeline(plan, now);
    const cancelled = steps.some((step) => step.status === "CANCELLED");
    if (plan.paymentMethod === "ONLINE_GATEWAY") {
      // Simulated gateway result: captured, or failed (and then cancelled).
      await db
        .update(orders)
        .set({ paymentStatus: cancelled ? "FAILED" : "PAID" })
        .where(eq(orders.id, order.id));
    }
    for (const step of steps) {
      await orderStatusService.changeStatus(
        order.id,
        step.status === "SHIPPED"
          ? { status: "SHIPPED", courierProvider: "mock", trackingId: `DEMO${order.orderNumber.slice(-8)}` }
          : { status: step.status, note: step.status === "CANCELLED" ? "Customer changed their mind" : undefined },
        admin,
      );
    }
    await backdateOrder(order.id, order.orderNumber, plan.at, steps);

    const finalStatus = steps.at(-1)?.status ?? "PENDING";
    summary.ordersCreated += 1;
    summary.ordersByStatus[finalStatus] = (summary.ordersByStatus[finalStatus] ?? 0) + 1;
  }
}

async function backdateOrder(orderId: string, orderNumber: string, placedAt: Date, steps: Array<{ status: OrderStatus; at: Date }>): Promise<void> {
  const when = (status: OrderStatus): Date | null => steps.find((step) => step.status === status)?.at ?? null;
  const lastChange = steps.at(-1)?.at ?? placedAt;
  const datedNumber = orderNumber.replace(/^ORD-\d{8}-/, `ORD-${businessDate(placedAt).replaceAll("-", "")}-`);
  const cancelledAt = when("CANCELLED");

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        orderNumber: datedNumber,
        createdAt: placedAt,
        updatedAt: lastChange,
        shippedAt: when("SHIPPED"),
        deliveredAt: when("DELIVERED"),
        cancelledAt,
      })
      .where(eq(orders.id, orderId));
    await tx.update(orderItems).set({ createdAt: placedAt }).where(eq(orderItems.orderId, orderId));
    await tx
      .update(orderStatusHistory)
      .set({ createdAt: placedAt })
      .where(and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.toStatus, "PENDING")));
    for (const step of steps) {
      await tx
        .update(orderStatusHistory)
        .set({ createdAt: step.at })
        .where(and(eq(orderStatusHistory.orderId, orderId), eq(orderStatusHistory.toStatus, step.status)));
    }
    await tx
      .update(stockHistoryLogs)
      .set({ createdAt: placedAt })
      .where(and(eq(stockHistoryLogs.orderId, orderId), eq(stockHistoryLogs.reason, "PURCHASE")));
    if (cancelledAt !== null) {
      await tx
        .update(stockHistoryLogs)
        .set({ createdAt: cancelledAt })
        .where(and(eq(stockHistoryLogs.orderId, orderId), eq(stockHistoryLogs.reason, "RETURN")));
    }
  });
}

async function createExpenses(admin: OrderViewer, today: string, summary: Summary): Promise<void> {
  const [existing] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(expenses)
    .where(like(expenses.note, `${DEMO_EXPENSE_NOTE}%`));
  if ((existing?.value ?? 0) > 0) return;

  const [year, month] = today.split("-").map(Number) as [number, number];
  const todayDay = Number(today.slice(8, 10));
  for (const plan of EXPENSE_PLANS) {
    // Spread the plan's entries over the 8 months, always including the current one.
    const offsets = [...Array(8).keys()].filter((offset) => offset === 0 || (offset * plan.months) % 8 < plan.months);
    for (const offset of offsets.slice(0, plan.months)) {
      const monthDate = new Date(Date.UTC(year, month - 1 - offset, 1));
      const maxDay = offset === 0 ? Math.max(1, todayDay) : 28;
      const day = intBetween(1, maxDay);
      const incurredOn = `${monthDate.toISOString().slice(0, 8)}${String(day).padStart(2, "0")}`;
      const amount = Math.round(between(plan.min, plan.max) / 10) * 10;
      const created = await expenseService.createExpense(
        {
          category: plan.category,
          amount,
          incurredOn,
          vendor: pick(plan.vendors),
          note: `${DEMO_EXPENSE_NOTE} · ${plan.label}`,
        },
        admin.id,
      );
      const at = businessInstant(incurredOn, 11 * 60);
      await db.update(expenses).set({ createdAt: at, updatedAt: at }).where(eq(expenses.id, created.id));
      summary.expensesCreated += 1;
    }
  }
}

/** Brings 4 products down to a few units (<= their low-stock threshold, never 0). */
async function createLowStock(catalog: DemoProduct[], admin: OrderViewer, today: string, summary: Summary): Promise<void> {
  const targets = [2, 3, 1, 4];
  const chosen = catalog.filter((_, index) => index % 5 === 2).slice(0, targets.length);
  for (const [index, product] of chosen.entries()) {
    const [meta] = await db
      .select({ threshold: products.lowStockThreshold })
      .from(products)
      .where(eq(products.id, product.id));
    const target = Math.max(1, Math.min(targets[index] ?? 2, meta?.threshold ?? 2));
    let excess = (await inventoryService.getTotalAvailableStock(product.id)) - target;
    if (excess <= 0) continue;
    const batches = await db
      .select({ id: productBatches.id, available: productBatches.availableQuantity })
      .from(productBatches)
      .where(
        and(
          eq(productBatches.productId, product.id),
          gt(productBatches.availableQuantity, 0),
          sql`${productBatches.expiryDate} > ${today}::date`,
        ),
      )
      .orderBy(desc(productBatches.expiryDate));
    for (const batch of batches) {
      if (excess <= 0) break;
      const take = Math.min(batch.available, excess);
      await inventoryService.adjustStock(
        {
          productId: product.id,
          batchId: batch.id,
          delta: -take,
          reason: "MANUAL_ADJUSTMENT",
          note: "Demo seed: damaged in storage (simulated low stock)",
        },
        admin.id,
      );
      excess -= take;
    }
    summary.lowStockAdjusted += 1;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<Summary> {
  const summary: Summary = {
    customersCreated: 0,
    customersTotal: 0,
    costBreakdowns: 0,
    ordersCreated: 0,
    ordersByStatus: {},
    ordersSkipped: 0,
    batchesImported: 0,
    expensesCreated: 0,
    lowStockAdjusted: 0,
  };
  const today = todayInBusinessTz();
  const admin = await findAdmin();
  const customers = await ensureCustomers(today, new Date(), summary);
  await ensureCostBreakdowns(summary);
  const catalog = await sellableProducts();
  if (catalog.length === 0) throw new Error("No seeded products found. Run `bun run db:seed` first.");
  await createOrders(customers, catalog, admin, today, summary);
  await createExpenses(admin, today, summary);
  await createLowStock(catalog, admin, today, summary);
  return summary;
}

if (import.meta.main) {
  main()
    .then((summary) => {
      console.log(
        [
          `Demo history ready (database host: ${databaseHost(env.DATABASE_URL) ?? "?"})`,
          `  customers      created ${summary.customersCreated}, demo total ${summary.customersTotal}`,
          `  cost breakdown ${summary.costBreakdowns} product(s)`,
          summary.ordersSkipped > 0
            ? `  orders         skipped (${summary.ordersSkipped} demo orders already exist)`
            : `  orders         created ${summary.ordersCreated} ${JSON.stringify(summary.ordersByStatus)}`,
          `  demo batches   imported ${summary.batchesImported}`,
          `  expenses       created ${summary.expensesCreated}`,
          `  low stock      ${summary.lowStockAdjusted} product(s) adjusted`,
        ].join("\n"),
      );
    })
    .then(() => closeDb())
    .then(() => process.exit(0))
    .catch(async (error: unknown) => {
      console.error("Demo history failed:", error instanceof Error ? error.message : String(error));
      await closeDb().catch(() => undefined);
      process.exit(1);
    });
}
