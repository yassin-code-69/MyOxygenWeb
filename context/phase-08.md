### Phase 8 Context & Architecture Blueprint

Phase 8 extends the **My Oxygen** backend into production-grade operational infrastructure by wiring three tightly coupled systems: a pluggable courier logistics layer, automated branded PDF invoice generation, and a multi-channel notification hub (email + SMS). Each system follows the same adapter/service pattern established in earlier phases — slim interfaces at the edge, rich implementations behind them, and zero coupling to the HTTP layer.

Key invariants codified during this phase:

- **Courier Adapter Pattern:** A single `ICourierProvider` interface insulates all business logic from the specific Steadfast (or any future) courier API. Swapping providers requires only a new class and an env-var change.

- **Fire-and-Forget Notifications:** Email and SMS confirmations are dispatched with `Promise.allSettled` inside the `NotificationService` so that a flaky third-party gateway can never block or roll back an order mutation.

- **PDF Invoices on Demand:** Invoices are generated server-side with `pdf-lib`, persisted to disk under `uploads/invoices/`, and their URL stored on the `orders` row — customers can retrieve their own invoice; admin can regenerate any time.

- **Bangladesh-Native Integrations:** Steadfast Courier and SSL Wireless SMS are wired as the default concrete providers — both are dominant in the Bangladesh logistics and telecom landscape.

---

### Step 1: Courier Service Adapter Pattern

Define a vendor-neutral interface and the Steadfast concrete implementation, then wire a factory that resolves the active provider from env.

#### `apps/api/src/services/courier/courier.interface.ts`

```typescript
export interface CreateParcelPayload {
  orderNumber: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  city: string;
  codAmount: number; // 0 for pre-paid / online-gateway orders
  note?: string;
  weight?: number; // kg, defaults to 0.5
}

export interface ParcelCreatedResult {
  trackingId: string;
  consignmentId: string; // provider-internal reference
  label?: string; // base64 PDF label, if provider returns it
}

export interface ParcelStatus {
  status: string; // raw provider status string
  normalizedStatus:
    | "PENDING"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "RETURNED"
    | "CANCELLED"
    | "UNKNOWN";
  location?: string;
  estimatedDelivery?: string; // ISO date string
  lastUpdated: string; // ISO datetime string
}

export interface ICourierProvider {
  /**
   * Register a new parcel with the courier and obtain a tracking ID.
   * Returns the tracking ID and any label data provided by the courier.
   */
  createParcel(payload: CreateParcelPayload): Promise<ParcelCreatedResult>;

  /**
   * Query the courier API for the live status of a parcel.
   */
  trackParcel(trackingId: string): Promise<ParcelStatus>;

  /**
   * Request cancellation of a parcel before it is picked up.
   * Returns true if the courier accepted the cancellation.
   */
  cancelParcel(trackingId: string): Promise<boolean>;
}
```

---

#### `apps/api/src/services/courier/steadfast.provider.ts`

Steadfast Courier operates a JSON REST API authenticated by `Api-Key` + `Api-Secret` headers. All monetary values are in BDT (Bangladeshi Taka).

```typescript
import type {
  ICourierProvider,
  CreateParcelPayload,
  ParcelCreatedResult,
  ParcelStatus,
} from "./courier.interface";

interface SteadfastCreateResponse {
  status: number;
  message: string;
  consignment: {
    consignment_id: string;
    tracking_code: string;
    invoice: string;
    recipient_name: string;
    recipient_phone: string;
    recipient_address: string;
    cod_amount: number;
    status: string;
    created_at: string;
  };
}

interface SteadfastTrackResponse {
  status: number;
  delivery_status: string;
  tracking_code: string;
}

const STEADFAST_STATUS_MAP: Record<string, ParcelStatus["normalizedStatus"]> = {
  "In Review": "PENDING",
  "Pending Pick Up": "PENDING",
  "Picked Up": "IN_TRANSIT",
  "At Hub": "IN_TRANSIT",
  "In Transit": "IN_TRANSIT",
  "Out for Delivery": "OUT_FOR_DELIVERY",
  Delivered: "DELIVERED",
  "Partial Delivered": "DELIVERED",
  Cancelled: "CANCELLED",
  "Hold On": "IN_TRANSIT",
  Unknown: "UNKNOWN",
  "Return in Transit": "RETURNED",
  Returned: "RETURNED",
};

export class SteadfastProvider implements ICourierProvider {
  private readonly baseUrl = "https://portal.steadfast.com.bd/api/v1";
  private readonly apiKey: string;
  private readonly apiSecret: string;

  constructor() {
    const apiKey = process.env.STEADFAST_API_KEY;
    const apiSecret = process.env.STEADFAST_API_SECRET;

    if (!apiKey || !apiSecret) {
      throw new Error(
        "STEADFAST_API_KEY and STEADFAST_API_SECRET must be set in environment",
      );
    }

    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private get authHeaders(): Record<string, string> {
    return {
      "Api-Key": this.apiKey,
      "Api-Secret": this.apiSecret,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async createParcel(
    payload: CreateParcelPayload,
  ): Promise<ParcelCreatedResult> {
    const body = {
      invoice: payload.orderNumber,
      recipient_name: payload.recipientName,
      recipient_phone: payload.recipientPhone,
      recipient_address: payload.recipientAddress,
      cod_amount: payload.codAmount,
      note: payload.note ?? "",
      weight: payload.weight ?? 0.5,
    };

    const response = await fetch(`${this.baseUrl}/create_order`, {
      method: "POST",
      headers: this.authHeaders,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Steadfast createParcel failed [${response.status}]: ${text}`,
      );
    }

    const data: SteadfastCreateResponse = await response.json();

    if (data.status !== 200) {
      throw new Error(`Steadfast createParcel error: ${data.message}`);
    }

    return {
      trackingId: data.consignment.tracking_code,
      consignmentId: data.consignment.consignment_id,
    };
  }

  async trackParcel(trackingId: string): Promise<ParcelStatus> {
    const response = await fetch(
      `${this.baseUrl}/status_by_trackingcode/${trackingId}`,
      {
        method: "GET",
        headers: this.authHeaders,
      },
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Steadfast trackParcel failed [${response.status}]: ${text}`,
      );
    }

    const data: SteadfastTrackResponse = await response.json();

    const rawStatus = data.delivery_status ?? "Unknown";
    const normalizedStatus = STEADFAST_STATUS_MAP[rawStatus] ?? "UNKNOWN";

    return {
      status: rawStatus,
      normalizedStatus,
      lastUpdated: new Date().toISOString(),
    };
  }

  async cancelParcel(trackingId: string): Promise<boolean> {
    const response = await fetch(`${this.baseUrl}/cancel_order`, {
      method: "POST",
      headers: this.authHeaders,
      body: JSON.stringify({ consignment_id: trackingId }),
    });

    if (!response.ok) {
      return false;
    }

    const data: { status: number } = await response.json();
    return data.status === 200;
  }
}
```

---

#### `apps/api/src/services/courier/courier.factory.ts`

The factory reads `COURIER_PROVIDER` from env at call time — no singleton, so test overrides are trivial.

```typescript
import type { ICourierProvider } from "./courier.interface";
import { SteadfastProvider } from "./steadfast.provider";

type SupportedProvider = "steadfast";

const PROVIDER_REGISTRY: Record<SupportedProvider, () => ICourierProvider> = {
  steadfast: () => new SteadfastProvider(),
};

/**
 * Returns the active ICourierProvider implementation.
 * Reads COURIER_PROVIDER from env (defaults to "steadfast").
 * Throws if the requested provider is not registered.
 */
export function getCourierProvider(name?: string): ICourierProvider {
  const providerName = (
    name ??
    process.env.COURIER_PROVIDER ??
    "steadfast"
  ).toLowerCase() as SupportedProvider;

  const factory = PROVIDER_REGISTRY[providerName];

  if (!factory) {
    throw new Error(
      `Courier provider "${providerName}" is not registered. ` +
        `Supported providers: ${Object.keys(PROVIDER_REGISTRY).join(", ")}`,
    );
  }

  return factory();
}
```

---

### Step 2: Courier Dispatch Endpoints

All logistics routes are mounted under `/admin/logistics` (staff-only) and `/orders` (customer-facing tracking).

#### `apps/api/src/routes/logistics.ts`

```typescript
import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "@my-oxygen/database";
import { orders, users } from "@my-oxygen/database/schema/tables";
import { requireAuth } from "../middleware/auth.middleware";
import { requirePermission } from "../middleware/rbac.middleware";
import { getCourierProvider } from "../services/courier/courier.factory";
import type { CreateParcelPayload } from "../services/courier/courier.interface";
import { generateInvoice, saveInvoice } from "../services/invoice.service";

export const logisticsRouter = new Hono();

// ──────────────────────────────────────────────────────
// ADMIN: Dispatch an order to the courier
// ──────────────────────────────────────────────────────
logisticsRouter.post(
  "/admin/logistics/dispatch/:orderId",
  requireAuth,
  requirePermission("COURIER_ASSIGN"),
  async (c) => {
    const { orderId } = c.req.param();

    // 1. Fetch the order with customer info
    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return c.json({ success: false, error: "Order not found" }, 404);
    }

    if (order.status !== "PROCESSING") {
      return c.json(
        {
          success: false,
          error: `Order must be in PROCESSING status to dispatch. Current: ${order.status}`,
        },
        409,
      );
    }

    if (order.trackingId) {
      return c.json(
        {
          success: false,
          error: `Order already dispatched with tracking ID: ${order.trackingId}`,
        },
        409,
      );
    }

    // 2. Fetch customer details
    const [customer] = await db
      .select({
        fullName: users.fullName,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, order.userId))
      .limit(1);

    if (!customer) {
      return c.json({ success: false, error: "Customer not found" }, 404);
    }

    // 3. Parse shipping address (stored as JSON string from Phase 3)
    let shippingAddress: {
      address: string;
      city: string;
      district: string;
    };
    try {
      shippingAddress = JSON.parse(order.shippingAddress);
    } catch {
      return c.json(
        { success: false, error: "Invalid shipping address format on order" },
        500,
      );
    }

    // 4. Build courier payload
    const payload: CreateParcelPayload = {
      orderNumber: order.orderNumber,
      recipientName: customer.fullName,
      recipientPhone: customer.phone,
      recipientAddress: shippingAddress.address,
      city: shippingAddress.city,
      codAmount: order.paymentMethod === "COD" ? parseFloat(order.total) : 0,
      note: `My Oxygen Order #${order.orderNumber}`,
      weight: 0.5,
    };

    // 5. Call courier provider
    const courier = getCourierProvider();
    let parcelResult;
    try {
      parcelResult = await courier.createParcel(payload);
    } catch (err) {
      return c.json(
        {
          success: false,
          error: `Courier API error: ${(err as Error).message}`,
        },
        502,
      );
    }

    // 6. Persist tracking info & update status
    const providerName = process.env.COURIER_PROVIDER ?? "steadfast";
    await db
      .update(orders)
      .set({
        status: "SHIPPED",
        courierProvider: providerName,
        trackingId: parcelResult.trackingId,
        updatedAt: new Date(),
      })
      .where(eq(orders.id, orderId));

    return c.json({
      success: true,
      data: {
        orderId,
        orderNumber: order.orderNumber,
        courierProvider: providerName,
        trackingId: parcelResult.trackingId,
        consignmentId: parcelResult.consignmentId,
      },
    });
  },
);

// ──────────────────────────────────────────────────────
// ADMIN: Live tracking status for any order
// ──────────────────────────────────────────────────────
logisticsRouter.get(
  "/admin/logistics/track/:orderId",
  requireAuth,
  requirePermission("ORDERS_READ"),
  async (c) => {
    const { orderId } = c.req.param();

    const [order] = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        trackingId: orders.trackingId,
        courierProvider: orders.courierProvider,
      })
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return c.json({ success: false, error: "Order not found" }, 404);
    }

    if (!order.trackingId) {
      return c.json(
        {
          success: false,
          error: "Order has not been dispatched to a courier yet",
        },
        400,
      );
    }

    const courier = getCourierProvider(order.courierProvider ?? undefined);
    let status;
    try {
      status = await courier.trackParcel(order.trackingId);
    } catch (err) {
      return c.json(
        {
          success: false,
          error: `Courier tracking API error: ${(err as Error).message}`,
        },
        502,
      );
    }

    return c.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        trackingId: order.trackingId,
        courierProvider: order.courierProvider,
        tracking: status,
      },
    });
  },
);

// ──────────────────────────────────────────────────────
// PUBLIC: Customer self-service tracking by order number
// ──────────────────────────────────────────────────────
logisticsRouter.get("/orders/:orderNumber/track", async (c) => {
  const { orderNumber } = c.req.param();

  const [order] = await db
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      trackingId: orders.trackingId,
      courierProvider: orders.courierProvider,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) {
    return c.json({ success: false, error: "Order not found" }, 404);
  }

  // If not yet shipped, return order status without calling courier
  if (!order.trackingId) {
    return c.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        trackingId: null,
        courierProvider: null,
        tracking: null,
      },
    });
  }

  const courier = getCourierProvider(order.courierProvider ?? undefined);
  let liveStatus;
  try {
    liveStatus = await courier.trackParcel(order.trackingId);
  } catch {
    // Return cached DB status rather than surfacing a 3rd-party error to customers
    return c.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        trackingId: order.trackingId,
        courierProvider: order.courierProvider,
        tracking: null,
        trackingError: "Live tracking temporarily unavailable",
      },
    });
  }

  return c.json({
    success: true,
    data: {
      orderNumber: order.orderNumber,
      status: order.status,
      trackingId: order.trackingId,
      courierProvider: order.courierProvider,
      tracking: liveStatus,
    },
  });
});

// ──────────────────────────────────────────────────────
// ADMIN: Generate PDF invoice for an order
// ──────────────────────────────────────────────────────
logisticsRouter.post(
  "/admin/orders/:orderId/invoice",
  requireAuth,
  requirePermission("INVOICE_GENERATE"),
  async (c) => {
    const { orderId } = c.req.param();

    const [order] = await db
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1);

    if (!order) {
      return c.json({ success: false, error: "Order not found" }, 404);
    }

    // Generate PDF buffer
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generateInvoice(orderId, db);
    } catch (err) {
      return c.json(
        {
          success: false,
          error: `Invoice generation failed: ${(err as Error).message}`,
        },
        500,
      );
    }

    // Save to disk and get public URL
    const invoiceUrl = await saveInvoice(orderId, pdfBuffer);

    // Persist URL on order row
    await db
      .update(orders)
      .set({ pdfInvoiceUrl: invoiceUrl, updatedAt: new Date() })
      .where(eq(orders.id, orderId));

    return c.json({
      success: true,
      data: {
        orderId,
        orderNumber: order.orderNumber,
        invoiceUrl,
      },
    });
  },
);

// ──────────────────────────────────────────────────────
// CUSTOMER: Download own invoice PDF
// ──────────────────────────────────────────────────────
logisticsRouter.get("/orders/:orderNumber/invoice", requireAuth, async (c) => {
  const { orderNumber } = c.req.param();
  const requestingUserId = c.get("userId") as string; // set by requireAuth

  const [order] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      orderNumber: orders.orderNumber,
      pdfInvoiceUrl: orders.pdfInvoiceUrl,
      status: orders.status,
    })
    .from(orders)
    .where(eq(orders.orderNumber, orderNumber))
    .limit(1);

  if (!order) {
    return c.json({ success: false, error: "Order not found" }, 404);
  }

  // Customers may only download their own invoices
  if (order.userId !== requestingUserId) {
    return c.json({ success: false, error: "Forbidden" }, 403);
  }

  if (!order.pdfInvoiceUrl) {
    return c.json(
      {
        success: false,
        error: "Invoice has not been generated for this order yet",
      },
      404,
    );
  }

  return c.json({
    success: true,
    data: {
      orderNumber: order.orderNumber,
      invoiceUrl: order.pdfInvoiceUrl,
    },
  });
});
```

---

### Step 3: PDF Invoice Generation

Uses `pdf-lib` for zero-native-dependency PDF construction — runs cleanly in any Node.js environment without system fonts or Cairo bindings.

Install the dependency:

```bash
pnpm --filter @my-oxygen/api add pdf-lib
```

#### `apps/api/src/services/invoice.service.ts`

```typescript
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { eq } from "drizzle-orm";
import type { DatabaseClient } from "@my-oxygen/database";
import {
  orders,
  orderItems,
  products,
  users,
} from "@my-oxygen/database/schema/tables";

// ── Brand colors (rgb 0-1 scale) ────────────────────────────────────────────
const BRAND_PINK = rgb(1, 0.42, 0.545); // #FF6B8B
const BRAND_GREEN = rgb(0.298, 0.686, 0.49); // #4CAF7D
const TEXT_DARK = rgb(0.122, 0.161, 0.216); // #1F2937
const TEXT_GRAY = rgb(0.42, 0.447, 0.502); // #6B7280
const WHITE = rgb(1, 1, 1);
const LIGHT_GRAY = rgb(0.95, 0.95, 0.95);

// ── Layout constants ─────────────────────────────────────────────────────────
const PAGE_WIDTH = 595; // A4 points
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface InvoiceOrderData {
  id: string;
  orderNumber: string;
  createdAt: Date;
  subtotal: string;
  deliveryFee: string;
  discountAmount: string;
  total: string;
  paymentMethod: string;
  shippingAddress: string;
  pdfInvoiceUrl: string | null;
  customer: {
    fullName: string;
    phone: string;
    email: string | null;
  };
  items: Array<{
    productTitle: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}

async function fetchOrderData(
  orderId: string,
  db: DatabaseClient,
): Promise<InvoiceOrderData> {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);

  if (!order) throw new Error(`Order ${orderId} not found`);

  const [customer] = await db
    .select({
      fullName: users.fullName,
      phone: users.phone,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, order.userId))
    .limit(1);

  if (!customer) throw new Error(`Customer for order ${orderId} not found`);

  const items = await db
    .select({
      productTitle: products.title,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      totalPrice: orderItems.totalPrice,
    })
    .from(orderItems)
    .innerJoin(products, eq(orderItems.productId, products.id))
    .where(eq(orderItems.orderId, orderId));

  return {
    ...order,
    customer,
    items,
  };
}

/**
 * Generate a branded PDF invoice and return it as a Buffer.
 * Queries full order data including line items and customer info.
 */
export async function generateInvoice(
  orderId: string,
  db: DatabaseClient,
): Promise<Buffer> {
  const data = await fetchOrderData(orderId, db);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  let y = PAGE_HEIGHT;

  // ── Header Bar ──────────────────────────────────────────────────────────────
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 80,
    width: PAGE_WIDTH,
    height: 80,
    color: BRAND_PINK,
  });

  // Brand name
  page.drawText("My Oxygen", {
    x: MARGIN,
    y: PAGE_HEIGHT - 48,
    size: 26,
    font: boldFont,
    color: WHITE,
  });

  // Tagline
  page.drawText("Maternal & Newborn Health | myoxygen.com.bd", {
    x: MARGIN,
    y: PAGE_HEIGHT - 66,
    size: 9,
    font: regularFont,
    color: rgb(1, 0.85, 0.9),
  });

  // "INVOICE" label right-aligned
  const invoiceLabel = "INVOICE";
  const invoiceLabelWidth = boldFont.widthOfTextAtSize(invoiceLabel, 20);
  page.drawText(invoiceLabel, {
    x: PAGE_WIDTH - MARGIN - invoiceLabelWidth,
    y: PAGE_HEIGHT - 50,
    size: 20,
    font: boldFont,
    color: WHITE,
  });

  y = PAGE_HEIGHT - 100;

  // ── Invoice Meta ─────────────────────────────────────────────────────────────
  page.drawText(`Invoice No: ${data.orderNumber}`, {
    x: MARGIN,
    y,
    size: 10,
    font: boldFont,
    color: TEXT_DARK,
  });

  const dateStr = new Date(data.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const dateLabel = `Date: ${dateStr}`;
  const dateLabelWidth = regularFont.widthOfTextAtSize(dateLabel, 10);
  page.drawText(dateLabel, {
    x: PAGE_WIDTH - MARGIN - dateLabelWidth,
    y,
    size: 10,
    font: regularFont,
    color: TEXT_GRAY,
  });

  y -= 24;

  // ── Divider ──────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 1,
    color: BRAND_GREEN,
  });

  y -= 20;

  // ── Billed To ────────────────────────────────────────────────────────────────
  page.drawText("BILLED TO", {
    x: MARGIN,
    y,
    size: 8,
    font: boldFont,
    color: BRAND_GREEN,
  });

  y -= 14;

  page.drawText(data.customer.fullName, {
    x: MARGIN,
    y,
    size: 11,
    font: boldFont,
    color: TEXT_DARK,
  });

  y -= 14;

  page.drawText(`Phone: ${data.customer.phone}`, {
    x: MARGIN,
    y,
    size: 9,
    font: regularFont,
    color: TEXT_GRAY,
  });

  if (data.customer.email) {
    y -= 12;
    page.drawText(`Email: ${data.customer.email}`, {
      x: MARGIN,
      y,
      size: 9,
      font: regularFont,
      color: TEXT_GRAY,
    });
  }

  y -= 12;

  // Parse and render shipping address
  let addrDisplay = data.shippingAddress;
  try {
    const addr = JSON.parse(data.shippingAddress);
    addrDisplay = `${addr.address}, ${addr.city}, ${addr.district}`;
  } catch {
    // use raw string as-is
  }

  page.drawText(`Address: ${addrDisplay}`, {
    x: MARGIN,
    y,
    size: 9,
    font: regularFont,
    color: TEXT_GRAY,
    maxWidth: CONTENT_WIDTH * 0.55,
  });

  y -= 28;

  // ── Items Table Header ───────────────────────────────────────────────────────
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_WIDTH,
    height: 20,
    color: TEXT_DARK,
  });

  const COL = {
    product: MARGIN + 8,
    qty: MARGIN + CONTENT_WIDTH * 0.56,
    unitPrice: MARGIN + CONTENT_WIDTH * 0.68,
    total: MARGIN + CONTENT_WIDTH * 0.84,
  };

  page.drawText("Product", {
    x: COL.product,
    y: y + 2,
    size: 8,
    font: boldFont,
    color: WHITE,
  });
  page.drawText("Qty", {
    x: COL.qty,
    y: y + 2,
    size: 8,
    font: boldFont,
    color: WHITE,
  });
  page.drawText("Unit Price", {
    x: COL.unitPrice,
    y: y + 2,
    size: 8,
    font: boldFont,
    color: WHITE,
  });
  page.drawText("Total", {
    x: COL.total,
    y: y + 2,
    size: 8,
    font: boldFont,
    color: WHITE,
  });

  y -= 20;

  // ── Items Table Rows ─────────────────────────────────────────────────────────
  data.items.forEach((item, index) => {
    if (index % 2 === 0) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 4,
        width: CONTENT_WIDTH,
        height: 18,
        color: LIGHT_GRAY,
      });
    }

    const productLabel =
      item.productTitle.length > 38
        ? item.productTitle.slice(0, 35) + "..."
        : item.productTitle;

    page.drawText(productLabel, {
      x: COL.product,
      y: y + 2,
      size: 8,
      font: regularFont,
      color: TEXT_DARK,
    });

    page.drawText(String(item.quantity), {
      x: COL.qty,
      y: y + 2,
      size: 8,
      font: regularFont,
      color: TEXT_DARK,
    });

    page.drawText(`৳ ${parseFloat(item.unitPrice).toFixed(2)}`, {
      x: COL.unitPrice,
      y: y + 2,
      size: 8,
      font: regularFont,
      color: TEXT_DARK,
    });

    page.drawText(`৳ ${parseFloat(item.totalPrice).toFixed(2)}`, {
      x: COL.total,
      y: y + 2,
      size: 8,
      font: boldFont,
      color: TEXT_DARK,
    });

    y -= 18;
  });

  y -= 8;

  // ── Divider ──────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: BRAND_PINK,
  });

  y -= 16;

  // ── Totals Block ─────────────────────────────────────────────────────────────
  const summaryX = MARGIN + CONTENT_WIDTH * 0.55;
  const valueX = PAGE_WIDTH - MARGIN - 8;

  const drawSummaryRow = (
    label: string,
    value: string,
    isBold = false,
    color = TEXT_DARK,
  ) => {
    page.drawText(label, {
      x: summaryX,
      y,
      size: 9,
      font: isBold ? boldFont : regularFont,
      color: TEXT_GRAY,
    });
    const valueWidth = (isBold ? boldFont : regularFont).widthOfTextAtSize(
      value,
      9,
    );
    page.drawText(value, {
      x: valueX - valueWidth,
      y,
      size: 9,
      font: isBold ? boldFont : regularFont,
      color,
    });
    y -= 15;
  };

  drawSummaryRow("Subtotal:", `৳ ${parseFloat(data.subtotal).toFixed(2)}`);
  drawSummaryRow(
    "Delivery Fee:",
    `৳ ${parseFloat(data.deliveryFee).toFixed(2)}`,
  );

  if (parseFloat(data.discountAmount) > 0) {
    drawSummaryRow(
      "Discount:",
      `- ৳ ${parseFloat(data.discountAmount).toFixed(2)}`,
      false,
      BRAND_GREEN,
    );
  }

  // Grand total row with background
  page.drawRectangle({
    x: summaryX - 8,
    y: y - 6,
    width: PAGE_WIDTH - MARGIN - summaryX + 8,
    height: 22,
    color: BRAND_PINK,
  });

  page.drawText("Grand Total:", {
    x: summaryX,
    y: y + 2,
    size: 10,
    font: boldFont,
    color: WHITE,
  });

  const grandTotalStr = `৳ ${parseFloat(data.total).toFixed(2)}`;
  const grandTotalWidth = boldFont.widthOfTextAtSize(grandTotalStr, 10);
  page.drawText(grandTotalStr, {
    x: valueX - grandTotalWidth,
    y: y + 2,
    size: 10,
    font: boldFont,
    color: WHITE,
  });

  y -= 30;

  // ── Payment Method Badge ──────────────────────────────────────────────────────
  const payLabel = `Payment Method: ${data.paymentMethod === "COD" ? "Cash on Delivery" : "Online Payment"}`;
  page.drawText(payLabel, {
    x: MARGIN,
    y,
    size: 9,
    font: regularFont,
    color: TEXT_GRAY,
  });

  y -= 40;

  // ── Footer ───────────────────────────────────────────────────────────────────
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: PAGE_WIDTH - MARGIN, y },
    thickness: 0.5,
    color: LIGHT_GRAY,
  });

  y -= 14;

  page.drawText(
    "Thank you for choosing My Oxygen — Supporting Mothers & Newborns in Bangladesh.",
    {
      x: MARGIN,
      y,
      size: 8,
      font: regularFont,
      color: TEXT_GRAY,
      maxWidth: CONTENT_WIDTH,
    },
  );

  y -= 12;
  page.drawText("Questions? Contact us at support@myoxygen.com.bd", {
    x: MARGIN,
    y,
    size: 8,
    font: regularFont,
    color: BRAND_PINK,
  });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Write a PDF buffer to disk under uploads/invoices/ and return the public URL.
 * Creates the directory if it does not exist.
 */
export async function saveInvoice(
  orderId: string,
  buffer: Buffer,
): Promise<string> {
  const uploadsDir =
    process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
  const invoicesDir = path.join(uploadsDir, "invoices");

  await fs.mkdir(invoicesDir, { recursive: true });

  const filename = `invoice-${orderId}.pdf`;
  const filePath = path.join(invoicesDir, filename);

  await fs.writeFile(filePath, buffer);

  const baseUrl = process.env.INVOICE_BASE_URL ?? "http://localhost:4000";
  return `${baseUrl}/uploads/invoices/${filename}`;
}
```

---

### Step 4: Notification Hub — Email Service

Uses `nodemailer` with an SMTP transport. All HTML templates are self-contained inline strings — no template engine dependency.

Install the dependency:

```bash
pnpm --filter @my-oxygen/api add nodemailer
pnpm --filter @my-oxygen/api add -D @types/nodemailer
```

#### `apps/api/src/services/notifications/email.service.ts`

```typescript
import nodemailer, { type Transporter } from "nodemailer";

interface OrderEmailData {
  id: string;
  orderNumber: string;
  total: string;
  subtotal: string;
  deliveryFee: string;
  discountAmount: string;
  paymentMethod: string;
  items?: Array<{
    productTitle: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}

interface CustomerEmailData {
  fullName: string;
  email: string | null;
  phone: string;
}

interface ProductEmailData {
  title: string;
  sku: string;
}

interface BatchEmailData {
  batchNumber: string;
  productTitle: string;
  expiryDate: string;
  availableQuantity: number;
}

// ── Brand constants ───────────────────────────────────────────────────────────
const BRAND_PINK = "#FF6B8B";
const BRAND_GREEN = "#4CAF7D";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin@myoxygen.com.bd";

// ── Shared email shell ────────────────────────────────────────────────────────
function htmlShell(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#FFF8F6;font-family:Arial,sans-serif;color:#1F2937;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F6;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
          style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:${BRAND_PINK};padding:24px 32px;">
              <h1 style="margin:0;color:#FFFFFF;font-size:24px;font-weight:700;">My Oxygen</h1>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:12px;">
                Maternal &amp; Newborn Health
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F9FAFB;padding:20px 32px;border-top:1px solid #E5E7EB;text-align:center;">
              <p style="margin:0;font-size:12px;color:#6B7280;">
                © ${new Date().getFullYear()} My Oxygen Bangladesh &nbsp;|&nbsp;
                <a href="mailto:support@myoxygen.com.bd"
                   style="color:${BRAND_PINK};text-decoration:none;">support@myoxygen.com.bd</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function itemsTable(items: NonNullable<OrderEmailData["items"]>): string {
  const rows = items
    .map(
      (item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;">${item.productTitle}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;text-align:center;">${item.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;text-align:right;">৳ ${parseFloat(item.unitPrice).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;text-align:right;font-weight:600;">৳ ${parseFloat(item.totalPrice).toFixed(2)}</td>
      </tr>`,
    )
    .join("");

  return `
  <table width="100%" cellpadding="0" cellspacing="0"
    style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;margin-top:16px;">
    <thead>
      <tr style="background:#1F2937;">
        <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:left;">Product</th>
        <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:center;">Qty</th>
        <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:right;">Unit Price</th>
        <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:right;">Total</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

export class EmailService {
  private transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  private async send(options: {
    to: string;
    subject: string;
    html: string;
  }): Promise<void> {
    await this.transporter.sendMail({
      from: `"My Oxygen" <${process.env.SMTP_USER ?? "noreply@myoxygen.com.bd"}>`,
      ...options,
    });
  }

  /**
   * Send an HTML order confirmation email to the customer.
   */
  async sendOrderConfirmation(
    order: OrderEmailData,
    customer: CustomerEmailData,
  ): Promise<void> {
    if (!customer.email) return; // SMS-only customer

    const body = `
      <h2 style="color:#1F2937;margin:0 0 8px;">Order Confirmed! 🎉</h2>
      <p style="color:#6B7280;margin:0 0 24px;">
        Hi <strong>${customer.fullName}</strong>, thank you for your order.<br/>
        We're preparing it now and will notify you once it ships.
      </p>

      <div style="background:#FFF8F6;border:1px solid #FFD6DF;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;">
          <strong>Order Number:</strong>
          <span style="color:${BRAND_PINK};font-weight:700;">${order.orderNumber}</span>
        </p>
        <p style="margin:6px 0 0;font-size:13px;color:#6B7280;">
          Payment Method: ${order.paymentMethod === "COD" ? "Cash on Delivery" : "Online Payment"}
        </p>
      </div>

      ${order.items ? itemsTable(order.items) : ""}

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:20px;">
        <tr>
          <td style="font-size:13px;color:#6B7280;">Subtotal</td>
          <td style="font-size:13px;text-align:right;">৳ ${parseFloat(order.subtotal).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="font-size:13px;color:#6B7280;">Delivery Fee</td>
          <td style="font-size:13px;text-align:right;">৳ ${parseFloat(order.deliveryFee).toFixed(2)}</td>
        </tr>
        ${
          parseFloat(order.discountAmount) > 0
            ? `<tr>
            <td style="font-size:13px;color:${BRAND_GREEN};">Discount</td>
            <td style="font-size:13px;text-align:right;color:${BRAND_GREEN};">- ৳ ${parseFloat(order.discountAmount).toFixed(2)}</td>
          </tr>`
            : ""
        }
        <tr>
          <td colspan="2"><hr style="border:none;border-top:1px solid #E5E7EB;margin:10px 0;" /></td>
        </tr>
        <tr>
          <td style="font-size:15px;font-weight:700;">Grand Total</td>
          <td style="font-size:15px;font-weight:700;text-align:right;color:${BRAND_PINK};">
            ৳ ${parseFloat(order.total).toFixed(2)}
          </td>
        </tr>
      </table>`;

    await this.send({
      to: customer.email,
      subject: `My Oxygen — Order #${order.orderNumber} Confirmed ✅`,
      html: htmlShell("Order Confirmed", body),
    });
  }

  /**
   * Notify the customer that their order has been shipped.
   */
  async sendShippingNotification(
    order: OrderEmailData,
    customer: CustomerEmailData,
    trackingId: string,
  ): Promise<void> {
    if (!customer.email) return;

    const trackingUrl = `${process.env.INVOICE_BASE_URL ?? "https://myoxygen.com.bd"}/orders/${order.orderNumber}/track`;

    const body = `
      <h2 style="color:#1F2937;margin:0 0 8px;">Your Order Is On Its Way! 🚚</h2>
      <p style="color:#6B7280;margin:0 0 24px;">
        Hi <strong>${customer.fullName}</strong>, great news!<br/>
        Order <strong style="color:${BRAND_PINK};">#${order.orderNumber}</strong>
        has been dispatched and is heading your way.
      </p>

      <div style="background:#F0FDF4;border:1px solid #A7F3D0;border-radius:8px;padding:16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;"><strong>Tracking ID:</strong>
          <span style="color:${BRAND_GREEN};font-weight:700;font-size:16px;">${trackingId}</span>
        </p>
        <p style="margin:10px 0 0;">
          <a href="${trackingUrl}"
             style="display:inline-block;background:${BRAND_GREEN};color:#FFFFFF;padding:10px 20px;
                    border-radius:6px;text-decoration:none;font-size:13px;font-weight:600;">
            Track My Order
          </a>
        </p>
      </div>

      <p style="color:#6B7280;font-size:13px;">
        Estimated delivery: <strong>2–4 business days</strong> depending on your location.
      </p>`;

    await this.send({
      to: customer.email,
      subject: `My Oxygen — Order #${order.orderNumber} Has Shipped 📦`,
      html: htmlShell("Order Shipped", body),
    });
  }

  /**
   * Send an internal low-stock alert to the admin inbox.
   */
  async sendLowStockAlert(
    product: ProductEmailData,
    availableQty: number,
  ): Promise<void> {
    const body = `
      <h2 style="color:#EF4444;margin:0 0 8px;">⚠️ Low Stock Alert</h2>
      <p style="color:#6B7280;margin:0 0 16px;">
        The following product has dropped below its low-stock threshold:
      </p>
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:16px;">
        <p style="margin:0;font-size:14px;"><strong>Product:</strong> ${product.title}</p>
        <p style="margin:6px 0 0;font-size:14px;"><strong>SKU:</strong> ${product.sku}</p>
        <p style="margin:6px 0 0;font-size:14px;color:#EF4444;">
          <strong>Available Quantity:</strong> ${availableQty} units remaining
        </p>
      </div>
      <p style="margin-top:20px;color:#6B7280;font-size:13px;">
        Please restock immediately to avoid order fulfilment failures.
      </p>`;

    await this.send({
      to: ADMIN_EMAIL,
      subject: `[My Oxygen] Low Stock — ${product.title} (${availableQty} left)`,
      html: htmlShell("Low Stock Alert", body),
    });
  }

  /**
   * Send an internal expiry alert for soon-to-expire batches.
   */
  async sendExpiryAlert(batches: BatchEmailData[]): Promise<void> {
    const rows = batches
      .map(
        (b) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;">${b.productTitle}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;">${b.batchNumber}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;color:#F59E0B;font-weight:600;">${b.expiryDate}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #F3F4F6;font-size:13px;text-align:center;">${b.availableQuantity}</td>
      </tr>`,
      )
      .join("");

    const body = `
      <h2 style="color:#F59E0B;margin:0 0 8px;">⏰ Batch Expiry Alert</h2>
      <p style="color:#6B7280;margin:0 0 16px;">
        The following batches are expiring soon. Please review and take action.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
        <thead>
          <tr style="background:#1F2937;">
            <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:left;">Product</th>
            <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:left;">Batch</th>
            <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:left;">Expiry Date</th>
            <th style="padding:10px 12px;color:#FFFFFF;font-size:12px;text-align:center;">Qty</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="margin-top:20px;color:#6B7280;font-size:13px;">
        Consider running a clearance promotion or marking these units for disposal.
      </p>`;

    await this.send({
      to: ADMIN_EMAIL,
      subject: `[My Oxygen] Expiry Alert — ${batches.length} batch(es) expiring soon`,
      html: htmlShell("Expiry Alert", body),
    });
  }
}
```

---

### Step 5: Notification Hub — SMS Service

Adapts to Bangladesh SMS gateways following the typical HTTP GET/POST API pattern used by SSL Wireless and Mimsms.

Install no additional dependency — uses native `fetch`.

#### `apps/api/src/services/notifications/sms.service.ts`

```typescript
interface SmsGatewayResponse {
  status: string | number;
  message?: string;
  error?: string;
}

export class SmsService {
  private readonly apiKey: string;
  private readonly senderId: string;
  private readonly gatewayUrl: string;

  constructor() {
    const apiKey = process.env.SMS_API_KEY;
    const senderId = process.env.SMS_SENDER_ID;
    const gatewayUrl = process.env.SMS_GATEWAY_URL;

    if (!apiKey || !senderId || !gatewayUrl) {
      throw new Error(
        "SMS_API_KEY, SMS_SENDER_ID, and SMS_GATEWAY_URL must be set in environment",
      );
    }

    this.apiKey = apiKey;
    this.senderId = senderId;
    this.gatewayUrl = gatewayUrl;
  }

  /**
   * Send a raw SMS message to a Bangladesh mobile number.
   * The number should include country code (e.g. +8801XXXXXXXXX).
   * Normalises to 8801XXXXXXXXX format expected by most BD gateways.
   */
  private async sendSms(to: string, message: string): Promise<void> {
    // Normalise: strip leading + if present
    const normalised = to.startsWith("+") ? to.slice(1) : to;

    const params = new URLSearchParams({
      api_key: this.apiKey,
      senderid: this.senderId,
      number: normalised,
      message,
      type: "text",
    });

    const response = await fetch(`${this.gatewayUrl}?${params.toString()}`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SMS gateway error [${response.status}]: ${text}`);
    }

    // Best-effort parse — different gateways return different shapes
    let data: SmsGatewayResponse;
    try {
      data = await response.json();
    } catch {
      return; // Non-JSON 200 response — treat as success
    }

    const statusCode = Number(data.status);
    // SSL Wireless uses 200/1011 for success; Mimsms uses "success"
    const isSuccess =
      statusCode === 200 ||
      statusCode === 1011 ||
      String(data.status).toLowerCase() === "success";

    if (!isSuccess) {
      throw new Error(
        `SMS gateway rejected message: ${data.message ?? data.error ?? JSON.stringify(data)}`,
      );
    }
  }

  /**
   * Send an order confirmation SMS to the customer.
   */
  async sendOrderConfirmationSMS(
    phone: string,
    orderNumber: string,
    total: string,
  ): Promise<void> {
    const totalBdt = parseFloat(total).toFixed(0);
    const message =
      `My Oxygen: Your order #${orderNumber} is confirmed. ` +
      `Total: ৳${totalBdt}. We'll notify you when it ships. ` +
      `Thank you for shopping with us!`;

    await this.sendSms(phone, message);
  }

  /**
   * Send a shipping update SMS to the customer.
   */
  async sendShippingUpdateSMS(
    phone: string,
    orderNumber: string,
    trackingId: string,
  ): Promise<void> {
    const message =
      `My Oxygen: Order #${orderNumber} has been shipped! ` +
      `Tracking ID: ${trackingId}. ` +
      `Track at: myoxygen.com.bd/track/${orderNumber}`;

    await this.sendSms(phone, message);
  }
}
```

---

### Step 6: Notification Orchestrator

The `NotificationService` coordinates email and SMS dispatching. All calls use `Promise.allSettled` so that a failed email never prevents the SMS from going out, and a crashed gateway never blocks order mutations.

#### `apps/api/src/services/notifications/notification.service.ts`

```typescript
import { EmailService } from "./email.service";
import { SmsService } from "./sms.service";

interface OrderNotificationData {
  id: string;
  orderNumber: string;
  total: string;
  subtotal: string;
  deliveryFee: string;
  discountAmount: string;
  paymentMethod: string;
  items?: Array<{
    productTitle: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
  }>;
}

interface CustomerNotificationData {
  fullName: string;
  email: string | null;
  phone: string;
}

export class NotificationService {
  private email: EmailService;
  private sms: SmsService;

  constructor() {
    this.email = new EmailService();
    this.sms = new SmsService();
  }

  /**
   * Fire order-placed notifications over both channels concurrently.
   * Uses Promise.allSettled — channel failures are logged, never thrown.
   * This method is intentionally fire-and-forget; never await it in the
   * HTTP handler if you want non-blocking behaviour.
   */
  async onOrderPlaced(
    order: OrderNotificationData,
    customer: CustomerNotificationData,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.email.sendOrderConfirmation(order, customer),
      this.sms.sendOrderConfirmationSMS(
        customer.phone,
        order.orderNumber,
        order.total,
      ),
    ]);

    this.logSettledResults("onOrderPlaced", order.orderNumber, results);
  }

  /**
   * Fire shipping notifications over both channels concurrently.
   */
  async onOrderShipped(
    order: OrderNotificationData,
    customer: CustomerNotificationData,
    trackingId: string,
  ): Promise<void> {
    const results = await Promise.allSettled([
      this.email.sendShippingNotification(order, customer, trackingId),
      this.sms.sendShippingUpdateSMS(
        customer.phone,
        order.orderNumber,
        trackingId,
      ),
    ]);

    this.logSettledResults("onOrderShipped", order.orderNumber, results);
  }

  private logSettledResults(
    event: string,
    orderNumber: string,
    results: PromiseSettledResult<void>[],
  ): void {
    const channels = ["email", "sms"];
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.error(
          `[NotificationService] ${event} — ${channels[index]} failed for order ${orderNumber}:`,
          result.reason,
        );
      } else {
        console.log(
          `[NotificationService] ${event} — ${channels[index]} sent for order ${orderNumber}`,
        );
      }
    });
  }
}
```

Wire `NotificationService` into the orders route (typically in `apps/api/src/routes/orders.ts`) as a fire-and-forget call after the order is committed to the database:

```typescript
// Inside POST /orders handler, after DB insert:
const notifier = new NotificationService();

// Fire-and-forget: do NOT await
notifier
  .onOrderPlaced(newOrder, customer)
  .catch((err) =>
    console.error("[orders] Notification fire-and-forget failed:", err),
  );

return c.json(
  { success: true, data: { orderNumber: newOrder.orderNumber } },
  201,
);
```

Similarly, inside the dispatch endpoint after `SHIPPED` status is set:

```typescript
const notifier = new NotificationService();

notifier
  .onOrderShipped(order, customer, parcelResult.trackingId)
  .catch((err) =>
    console.error("[logistics] Shipping notification failed:", err),
  );
```

---

### Step 7: Environment Variable Updates

#### `.env.example` (additions for Phase 8)

```dotenv
# ─────────────────────────────────────────────────────────────────────────────
# Phase 8: Courier Logistics
# ─────────────────────────────────────────────────────────────────────────────

# Active courier provider — must match a key in courier.factory.ts
# Supported: steadfast
COURIER_PROVIDER=steadfast

# Steadfast Courier (https://portal.steadfast.com.bd)
STEADFAST_API_KEY=your_steadfast_api_key_here
STEADFAST_API_SECRET=your_steadfast_api_secret_here

# ─────────────────────────────────────────────────────────────────────────────
# Phase 8: PDF Invoice Generation
# ─────────────────────────────────────────────────────────────────────────────

# Base URL for generated invoice download links
INVOICE_BASE_URL=https://api.myoxygen.com.bd

# Absolute path where uploaded files (invoices, etc.) are stored on the server
# Defaults to <cwd>/uploads if unset
UPLOADS_DIR=/var/www/my-oxygen/uploads

# ─────────────────────────────────────────────────────────────────────────────
# Phase 8: Email Notifications (SMTP)
# ─────────────────────────────────────────────────────────────────────────────

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
# Set to true only when using port 465 (implicit TLS)
SMTP_SECURE=false
SMTP_USER=noreply@myoxygen.com.bd
SMTP_PASS=your_smtp_app_password_here

# Internal admin mailbox for low-stock and expiry alerts
ADMIN_EMAIL=admin@myoxygen.com.bd

# ─────────────────────────────────────────────────────────────────────────────
# Phase 8: SMS Notifications (Bangladesh Gateway)
# ─────────────────────────────────────────────────────────────────────────────

# API key issued by your BD SMS provider (SSL Wireless / Mimsms / etc.)
SMS_API_KEY=your_sms_api_key_here

# Sender ID approved by BTRC (typically your brand name or a short code)
SMS_SENDER_ID=MyOxygen

# Full gateway endpoint URL (provider-specific, GET-based HTTP API)
# SSL Wireless example:
SMS_GATEWAY_URL=https://sms.sslwireless.com/pushapi/dynamic/server.php
# Mimsms example:
# SMS_GATEWAY_URL=https://app.mimsms.com/smsapi
```

---

### Step 8: Phase 8 Verification Checklist

Execute these commands sequentially to confirm the full logistics + invoicing + notification pipeline is operational.

1. **Install new dependencies:**

```bash
pnpm --filter @my-oxygen/api add pdf-lib nodemailer
pnpm --filter @my-oxygen/api add -D @types/nodemailer
```

_Expected outcome:_ Dependencies resolve and lock-file updates cleanly.

2. **TypeScript compilation check:**

```bash
pnpm --filter @my-oxygen/api build
```

_Expected outcome:_ Zero TypeScript errors across all new service and route files.

3. **Dispatch an order to Steadfast courier:**

```bash
curl -s -X POST http://localhost:4000/admin/logistics/dispatch/<ORDER_ID> \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  | jq .
```

_Expected outcome:_ `200 OK` with `trackingId` and `courierProvider: "steadfast"`. Order status in DB changes to `SHIPPED`.

4. **Admin live tracking lookup:**

```bash
curl -s http://localhost:4000/admin/logistics/track/<ORDER_ID> \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  | jq .
```

_Expected outcome:_ `200 OK` with `tracking.normalizedStatus` mapped from Steadfast's response.

5. **Public customer tracking (no auth required):**

```bash
curl -s http://localhost:4000/orders/<ORDER_NUMBER>/track \
  | jq .
```

_Expected outcome:_ `200 OK` with tracking data or graceful fallback when courier API is unavailable.

6. **Generate a PDF invoice:**

```bash
curl -s -X POST http://localhost:4000/admin/orders/<ORDER_ID>/invoice \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  | jq .
```

_Expected outcome:_ `200 OK` with `invoiceUrl` pointing to `/uploads/invoices/invoice-<ORDER_ID>.pdf`. File exists on disk at `$UPLOADS_DIR/invoices/`.

7. **Customer downloads their own invoice:**

```bash
curl -s http://localhost:4000/orders/<ORDER_NUMBER>/invoice \
  -H "Authorization: Bearer <CUSTOMER_JWT>" \
  | jq .
```

_Expected outcome:_ `200 OK` with `invoiceUrl`. Returns `403` if a different customer's JWT is used.

8. **Smoke-test notification fire-and-forget (observe server logs):**

Place a new test order via `POST /orders` and check the API server stdout:

```text
[NotificationService] onOrderPlaced — email sent for order MYO-XXXXXX
[NotificationService] onOrderPlaced — sms sent for order MYO-XXXXXX
```

_Expected outcome:_ Both channels log success. If SMTP or SMS credentials are test placeholders, confirm the `rejected` log line appears instead of an unhandled exception crash.

9. **Verify PDF file on disk:**

```bash
ls -lh $UPLOADS_DIR/invoices/
file $UPLOADS_DIR/invoices/invoice-<ORDER_ID>.pdf
```

_Expected outcome:_ File is a valid PDF (`PDF document, version 1.7`).
