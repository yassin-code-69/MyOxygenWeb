import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { categories, invoices, productBatches, products, users } from "../db/schema/tables";
import { app } from "../index";
import { addDays, todayInBusinessTz } from "../lib/dates";
import { signAccessToken } from "../lib/jwt";
import type { InvoiceDetailDTO, InvoiceListItemDTO, InvoiceSummaryDTO } from "../services/invoice/invoice.service";
import type { OrderDetailDTO } from "../services/order-dto";
import type { PaginationMeta, UserRole } from "../types";

const RUN = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
let sequence = 0;

interface TestUser {
  id: string;
  token: string;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  meta?: PaginationMeta;
  error?: { code: string; message: string; details?: unknown };
}

function uniquePhone(): string {
  return `01${3 + Math.floor(Math.random() * 7)}${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
}

async function createUser(role: UserRole): Promise<TestUser> {
  sequence += 1;
  const phone = uniquePhone();
  const [user] = await db
    .insert(users)
    .values({
      fullName: `Invoices ${role} ${sequence}`,
      email: `invoices-${role.toLowerCase()}-${RUN}-${sequence}@test.myoxygen.local`,
      phone,
      passwordHash: "not-used",
      role,
    })
    .returning({ id: users.id });
  if (!user) throw new Error("user fixture failed");
  return { id: user.id, token: await signAccessToken({ sub: user.id, role, phone }) };
}

async function call<T>(
  method: string,
  path: string,
  token?: string,
): Promise<{ status: number; body: Envelope<T> }> {
  const response = await app.request(path, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const text = await response.text();
  return { status: response.status, body: (text ? JSON.parse(text) : {}) as Envelope<T> };
}

async function fetchPdf(path: string, token: string): Promise<{ status: number; header: string }> {
  const response = await app.request(path, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status !== 200) return { status: response.status, header: "" };
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  const bytes = new Uint8Array(await response.arrayBuffer());
  return { status: response.status, header: new TextDecoder().decode(bytes.subarray(0, 5)) };
}

let admin: TestUser;
let manager: TestUser;
let support: TestUser;
let customer: TestUser;
let productId: string;
const recipientPhone = "01733445566";

async function placeOrder(): Promise<OrderDetailDTO> {
  const response = await app.request("/orders/checkout", {
    method: "POST",
    headers: { Authorization: `Bearer ${customer.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      items: [{ productId, quantity: 2 }],
      paymentMethod: "COD",
      shippingAddress: {
        fullName: "Jaber Ahmed",
        phone: recipientPhone,
        addressLine1: "House 12, Road 5",
        addressLine2: "Block C",
        city: "Dhaka",
        district: "Gulshan",
        postalCode: "1212",
      },
    }),
  });
  const body = (await response.json()) as Envelope<OrderDetailDTO>;
  if (response.status !== 201) throw new Error(`checkout failed: ${response.status}`);
  return body.data;
}

beforeAll(async () => {
  admin = await createUser("SUPER_ADMIN");
  manager = await createUser("ORDER_MANAGER");
  support = await createUser("SUPPORT_STAFF");
  customer = await createUser("CUSTOMER");

  const [category] = await db
    .insert(categories)
    .values({ name: `Invoices ${RUN}`, slug: `invoices-${RUN}` })
    .returning({ id: categories.id });
  if (!category) throw new Error("category fixture failed");
  const [product] = await db
    .insert(products)
    .values({
      categoryId: category.id,
      title: `Invoice Gentle Cleanser ${RUN}`,
      slug: `invoice-cleanser-${RUN}`,
      sku: `INV-CLEAN-${RUN}`,
      description: "Gentle baby cleanser",
      basePrice: "950.00",
      costPrice: "500.00",
    })
    .returning({ id: products.id });
  if (!product) throw new Error("product fixture failed");
  productId = product.id;
  await db.insert(productBatches).values({
    productId,
    batchNumber: `INV-${RUN}`,
    expiryDate: addDays(todayInBusinessTz(), 400),
    initialQuantity: 100,
    availableQuantity: 100,
  });
}, 60_000);

describe("Invoice generation", () => {
  let order: OrderDetailDTO;
  let invoice: InvoiceDetailDTO;

  beforeAll(async () => {
    order = await placeOrder();
  });

  it("requires INVOICE_GENERATE", async () => {
    expect((await call("POST", `/admin/invoices/generate/${order.id}`, support.token)).status).toBe(403);
    expect((await call("POST", `/admin/invoices/generate/${order.id}`, customer.token)).status).toBe(403);
    expect((await call("POST", `/admin/invoices/generate/${order.id}`)).status).toBe(401);
    expect((await call("POST", "/admin/invoices/generate/not-a-uuid", manager.token)).status).toBe(422);
    expect((await call("POST", "/admin/invoices/generate/00000000-0000-4000-8000-000000000404", manager.token)).status).toBe(404);
  });

  it("builds the invoice from the stored shipping address with real payment enum values", async () => {
    const res = await call<InvoiceDetailDTO>("POST", `/admin/invoices/generate/${order.id}`, manager.token);
    expect(res.status).toBe(200);
    invoice = res.body.data;
    expect(invoice).toMatchObject({
      orderId: order.id,
      orderNumber: order.orderNumber,
      invoiceNumber: order.orderNumber.replace(/^ORD-/, "INV-"),
      customerName: "Jaber Ahmed",
      customerPhone: recipientPhone,
      customerAddress: "House 12, Road 5, Block C, Dhaka, Gulshan, 1212",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      subtotal: 1900,
      deliveryFee: 0,
      discountAmount: 0,
      totalAmount: 1900,
      itemCount: 2,
      hasPdf: true,
    });
    expect(invoice.items).toEqual([
      expect.objectContaining({
        productId,
        title: `Invoice Gentle Cleanser ${RUN}`,
        quantity: 2,
        unitPrice: 950,
        totalPrice: 1900,
      }),
    ]);
    expect(invoice.order).toMatchObject({ id: order.id, status: "PENDING" });
  });

  it("serves details by id or invoice number and 404 for unknown invoices", async () => {
    const byId = await call<InvoiceDetailDTO>("GET", `/admin/invoices/${invoice.id}`, support.token);
    expect(byId.status).toBe(200);
    expect(byId.body.data.invoiceNumber).toBe(invoice.invoiceNumber);
    const byNumber = await call<InvoiceDetailDTO>("GET", `/admin/invoices/${invoice.invoiceNumber.toLowerCase()}`, admin.token);
    expect(byNumber.body.data.id).toBe(invoice.id);
    expect((await call("GET", "/admin/invoices/00000000-0000-4000-8000-000000000000", admin.token)).status).toBe(404);
    expect((await call("GET", `/admin/invoices/${invoice.id}`, customer.token)).status).toBe(403);
  });

  it("streams the stored PDF", async () => {
    const pdf = await fetchPdf(`/admin/invoices/${invoice.id}/pdf`, support.token);
    expect(pdf).toEqual({ status: 200, header: "%PDF-" });
  });

  it("lists invoices with pagination, filters and phone search", async () => {
    const all = await call<InvoiceListItemDTO[]>("GET", "/admin/invoices?page=1&limit=5", admin.token);
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ page: 1, limit: 5 });
    expect(all.body.data.length).toBeGreaterThan(0);

    const search = await call<InvoiceListItemDTO[]>(
      "GET",
      `/admin/invoices?q=${encodeURIComponent("+880 1733-445566")}&paymentMethod=COD&paymentStatus=UNPAID`,
      admin.token,
    );
    expect(search.status).toBe(200);
    const row = search.body.data.find((item) => item.id === invoice.id);
    expect(row).toMatchObject({ orderNumber: order.orderNumber, paymentMethod: "COD", hasPdf: true, totalAmount: 1900 });

    const legacyAlias = await call<InvoiceListItemDTO[]>(
      "GET",
      `/admin/invoices?q=${invoice.invoiceNumber}&paymentMethod=CASH_ON_DELIVERY`,
      admin.token,
    );
    expect(legacyAlias.body.data.map((item) => item.id)).toEqual([invoice.id]);

    const online = await call<InvoiceListItemDTO[]>(
      "GET",
      `/admin/invoices?q=${invoice.invoiceNumber}&paymentMethod=ONLINE_GATEWAY`,
      admin.token,
    );
    expect(online.body.data).toEqual([]);

    expect((await call("GET", "/admin/invoices?paymentStatus=MAYBE", admin.token)).status).toBe(422);
    expect((await call("GET", "/admin/invoices", customer.token)).status).toBe(403);
    expect((await call("GET", "/admin/invoices")).status).toBe(401);
  });

  it("summarises totals counting COD with the real enum value", async () => {
    const res = await call<InvoiceSummaryDTO>("GET", "/admin/invoices/summary", admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.totalInvoices).toBeGreaterThanOrEqual(1);
    expect(res.body.data.codCount).toBeGreaterThanOrEqual(1);
    expect(res.body.data.totalBilledAmount).toBeGreaterThanOrEqual(1900);
    expect(typeof res.body.data.onlineCount).toBe("number");
  });
});

describe("PDF access without INVOICE_GENERATE", () => {
  it("never creates a PDF for staff who may not generate invoices", async () => {
    const order = await placeOrder();
    const [placeholder] = await db
      .insert(invoices)
      .values({
        invoiceNumber: order.orderNumber.replace(/^ORD-/, "INV-"),
        orderId: order.id,
        userId: customer.id,
        customerName: "Jaber Ahmed",
        customerPhone: recipientPhone,
        customerAddress: "House 12, Road 5",
        paymentMethod: "COD",
        paymentStatus: "UNPAID",
        subtotal: "1900.00",
        totalAmount: "1900.00",
        itemsSnapshot: [],
      })
      .returning({ id: invoices.id });
    if (!placeholder) throw new Error("invoice fixture failed");

    const denied = await fetchPdf(`/admin/invoices/${placeholder.id}/pdf`, support.token);
    expect(denied.status).toBe(404);
    const [unchanged] = await db
      .select({ pdf: invoices.pdfBase64 })
      .from(invoices)
      .where(eq(invoices.id, placeholder.id));
    expect(unchanged?.pdf).toBeNull();

    const generated = await fetchPdf(`/admin/invoices/${placeholder.id}/pdf`, manager.token);
    expect(generated).toEqual({ status: 200, header: "%PDF-" });
    const [stored] = await db
      .select({ pdf: invoices.pdfBase64 })
      .from(invoices)
      .where(eq(invoices.id, placeholder.id));
    expect(stored?.pdf).not.toBeNull();

    expect((await fetchPdf("/admin/invoices/00000000-0000-4000-8000-000000000000/pdf", manager.token)).status).toBe(404);
  });

  it("lets the customer download their own invoice from /orders/:id/invoice", async () => {
    const order = await placeOrder();
    const pdf = await fetchPdf(`/orders/${order.id}/invoice`, customer.token);
    expect(pdf).toEqual({ status: 200, header: "%PDF-" });
  });
});
