/**
 * Branded A4 PDF invoices (pdf-lib, standard Helvetica fonts) persisted in the
 * `invoices` table (metadata + base64 PDF; nothing is written to local disk).
 *
 * Plan 008 mandates the standard fonts, which only cover WinAnsi: amounts are
 * printed as "BDT 1,234.00" (the ৳ glyph is not available) and non-Latin
 * characters are dropped from free text.
 *
 * The invoice reflects the order at generation time. It is generated in the
 * background after checkout, regenerated when the payment status changes, and
 * generated on demand when a PDF is requested before the job ran.
 */
import { and, count, desc, eq, sql, type SQL } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { z } from "zod";
import { db } from "../../db/client";
import { invoices, orders } from "../../db/schema/tables";
import { AppError } from "../../lib/errors";
import { BRAND } from "../notification/templates";
import { formatShippingAddress, type OrderDetailDTO, type PaymentMethod, type PaymentStatus } from "../order-dto";
import { moneyToNumber, paisaToAmount, toPaisa } from "../order-pricing";
import { orderService, SYSTEM_ORDER_VIEWER } from "../order.service";
import { normalizeBangladeshMobile } from "../phone";
import { containsPattern } from "../service-utils";
import { onOrAfterBusinessDay, onOrBeforeBusinessDay } from "../sql-time";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvoiceLine {
  title: string;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

/** Everything printed on an invoice. */
export interface InvoiceDocument {
  invoiceNumber: string;
  orderNumber: string;
  issuedAt: Date;
  paymentMethod: string;
  paymentStatus: string;
  customer: { name: string; phone: string; email: string | null; address: string };
  items: InvoiceLine[];
  subtotal: number;
  deliveryFee: number;
  discountAmount: number;
  couponCode: string | null;
  total: number;
}

export interface InvoiceItemSnapshot {
  orderItemId: string | null;
  productId: string | null;
  title: string;
  sku: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface InvoiceListItemDTO {
  id: string;
  invoiceNumber: string;
  orderId: string;
  orderNumber: string | null;
  userId: string | null;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  /** "COD" | "ONLINE_GATEWAY" (legacy rows may contain "CASH_ON_DELIVERY"). */
  paymentMethod: string;
  paymentStatus: string;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  totalAmount: number;
  itemCount: number;
  hasPdf: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceDetailDTO extends InvoiceListItemDTO {
  items: InvoiceItemSnapshot[];
  order: {
    id: string;
    orderNumber: string;
    status: string;
    paymentStatus: string;
    trackingId: string | null;
    courierProvider: string | null;
    createdAt: string;
  } | null;
}

export interface InvoiceSummaryDTO {
  totalInvoices: number;
  totalBilledAmount: number;
  codCount: number;
  onlineCount: number;
}

export interface InvoiceListQuery {
  page: number;
  limit: number;
  q?: string;
  paymentStatus?: PaymentStatus;
  paymentMethod?: PaymentMethod;
  from?: string;
  to?: string;
}

export interface InvoicePdf {
  invoiceNumber: string;
  orderNumber: string | null;
  pdf: Uint8Array;
}

type InvoiceRecord = typeof invoices.$inferSelect;

// ---------------------------------------------------------------------------
// PDF rendering
// ---------------------------------------------------------------------------

const PAGE_SIZE: [number, number] = [595.28, 841.89]; // A4 in points
const MARGIN = 40;
const FOOTER_HEIGHT = 70;
const ROW_HEIGHT = 22;

const COLORS: Readonly<Record<"primary" | "text" | "muted" | "light" | "border" | "white", RGB>> = {
  primary: rgb(255 / 255, 107 / 255, 139 / 255),
  text: rgb(31 / 255, 41 / 255, 55 / 255),
  muted: rgb(107 / 255, 114 / 255, 128 / 255),
  light: rgb(1, 248 / 255, 246 / 255),
  border: rgb(0.88, 0.86, 0.88),
  white: rgb(1, 1, 1),
};

const COLUMNS = {
  item: { x: MARGIN + 8, width: 190 },
  batch: { x: 245, width: 115 },
  qtyRight: 395,
  unitRight: 475,
  totalRight: PAGE_SIZE[0] - MARGIN - 8,
} as const;

/** WinAnsi-safe text: ৳ → "BDT", other non-printable/non-Latin characters removed. */
export function pdfSafeText(value: string): string {
  return value
    .replace(/৳/g, "BDT ")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatAmount(amount: number): string {
  return amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatBdt(amount: number): string {
  return `BDT ${formatAmount(amount)}`;
}

function paymentMethodLabel(method: string): string {
  if (method === "COD" || method === "CASH_ON_DELIVERY") return "Cash on Delivery";
  if (method === "ONLINE_GATEWAY") return "Online Payment";
  return method;
}

function fit(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const safe = pdfSafeText(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let end = safe.length;
  while (end > 0 && font.widthOfTextAtSize(`${safe.slice(0, end)}...`, size) > maxWidth) end--;
  return `${safe.slice(0, end)}...`;
}

/** Splits text into lines that fit `maxWidth` (at most `maxLines`, last one truncated). */
function wrap(font: PDFFont, text: string, size: number, maxWidth: number, maxLines: number): string[] {
  const words = pdfSafeText(text).split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length === maxLines) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length > maxLines) lines.length = maxLines;
  return lines.map((line) => fit(font, line, size, maxWidth));
}

export async function renderInvoicePdf(document: InvoiceDocument): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Invoice ${document.invoiceNumber}`);
  pdf.setAuthor(BRAND.name);
  pdf.setCreationDate(document.issuedAt);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = PAGE_SIZE;

  const text = (page: PDFPage, value: string, x: number, y: number, size: number, font: PDFFont, color: RGB) =>
    page.drawText(pdfSafeText(value), { x, y, size, font, color });
  const textRight = (page: PDFPage, value: string, right: number, y: number, size: number, font: PDFFont, color: RGB) => {
    const safe = pdfSafeText(value);
    page.drawText(safe, { x: right - font.widthOfTextAtSize(safe, size), y, size, font, color });
  };

  // ---- First page header ----
  let page = pdf.addPage(PAGE_SIZE);
  page.drawRectangle({ x: 0, y: height - 85, width, height: 85, color: COLORS.primary });
  text(page, BRAND.name.toUpperCase(), MARGIN, height - 42, 22, bold, COLORS.white);
  text(page, BRAND.tagline, MARGIN, height - 60, 10, regular, COLORS.white);
  textRight(page, "INVOICE", width - MARGIN, height - 44, 20, bold, COLORS.white);
  textRight(page, "TAX INVOICE / CASH MEMO", width - MARGIN, height - 60, 8, regular, COLORS.white);

  // ---- Bill to / order details ----
  let leftY = height - 115;
  text(page, "BILL TO", MARGIN, leftY, 9, bold, COLORS.primary);
  leftY -= 16;
  text(page, fit(bold, document.customer.name || "Customer", 11, 260), MARGIN, leftY, 11, bold, COLORS.text);
  leftY -= 15;
  if (document.customer.phone) {
    text(page, `Phone: ${document.customer.phone}`, MARGIN, leftY, 9, regular, COLORS.muted);
    leftY -= 13;
  }
  if (document.customer.email) {
    text(page, fit(regular, `Email: ${document.customer.email}`, 9, 260), MARGIN, leftY, 9, regular, COLORS.muted);
    leftY -= 13;
  }
  for (const line of wrap(regular, `Address: ${document.customer.address}`, 9, 260, 3)) {
    text(page, line, MARGIN, leftY, 9, regular, COLORS.muted);
    leftY -= 13;
  }

  const metaX = 340;
  let metaY = height - 115;
  text(page, "ORDER DETAILS", metaX, metaY, 9, bold, COLORS.primary);
  metaY -= 16;
  const meta: Array<[string, string]> = [
    ["Invoice No:", document.invoiceNumber],
    ["Order No:", document.orderNumber],
    ["Invoice Date:", document.issuedAt.toISOString().slice(0, 10)],
    ["Payment Method:", paymentMethodLabel(document.paymentMethod)],
    ["Payment Status:", document.paymentStatus],
  ];
  for (const [label, value] of meta) {
    text(page, label, metaX, metaY, 9, regular, COLORS.muted);
    text(page, fit(bold, value, 9, width - MARGIN - metaX - 85), metaX + 85, metaY, 9, bold, COLORS.text);
    metaY -= 14;
  }

  // ---- Items table ----
  const drawTableHeader = (target: PDFPage, top: number): number => {
    target.drawRectangle({ x: MARGIN, y: top - 22, width: width - 2 * MARGIN, height: 22, color: COLORS.light });
    const y = top - 15;
    text(target, "ITEM", COLUMNS.item.x, y, 8, bold, COLORS.text);
    text(target, "BATCH / EXPIRY", COLUMNS.batch.x, y, 8, bold, COLORS.text);
    textRight(target, "QTY", COLUMNS.qtyRight, y, 8, bold, COLORS.text);
    textRight(target, "UNIT (BDT)", COLUMNS.unitRight, y, 8, bold, COLORS.text);
    textRight(target, "TOTAL (BDT)", COLUMNS.totalRight, y, 8, bold, COLORS.text);
    return top - 22;
  };

  const newPage = (): PDFPage => {
    const next = pdf.addPage(PAGE_SIZE);
    next.drawRectangle({ x: 0, y: height - 40, width, height: 40, color: COLORS.primary });
    text(next, `${BRAND.name.toUpperCase()}  |  Invoice ${document.invoiceNumber} (continued)`, MARGIN, height - 26, 11, bold, COLORS.white);
    return next;
  };

  let y = drawTableHeader(page, Math.min(leftY, metaY) - 12);
  for (const item of document.items) {
    if (y - ROW_HEIGHT < FOOTER_HEIGHT + 10) {
      page = newPage();
      y = drawTableHeader(page, height - 60);
    }
    y -= ROW_HEIGHT;
    page.drawLine({ start: { x: MARGIN, y }, end: { x: width - MARGIN, y }, thickness: 0.5, color: COLORS.border });
    const rowY = y + 8;
    const title = item.sku ? `${item.title} (${item.sku})` : item.title;
    text(page, fit(regular, title || "Product", 8.5, COLUMNS.item.width), COLUMNS.item.x, rowY, 8.5, regular, COLORS.text);
    const batch = item.batchNumber
      ? `${item.batchNumber}${item.expiryDate ? ` / ${item.expiryDate}` : ""}`
      : "-";
    text(page, fit(regular, batch, 8, COLUMNS.batch.width), COLUMNS.batch.x, rowY, 8, regular, COLORS.muted);
    textRight(page, String(item.quantity), COLUMNS.qtyRight, rowY, 8.5, regular, COLORS.text);
    textRight(page, formatAmount(item.unitPrice), COLUMNS.unitRight, rowY, 8.5, regular, COLORS.text);
    textRight(page, formatAmount(item.totalPrice), COLUMNS.totalRight, rowY, 8.5, bold, COLORS.text);
  }

  // ---- Totals ----
  const summaryHeight = 140;
  if (y - summaryHeight < FOOTER_HEIGHT) {
    page = newPage();
    y = height - 60;
  }
  const labelX = 340;
  y -= 22;
  const summaryRows: Array<[string, string]> = [
    ["Subtotal:", formatBdt(document.subtotal)],
    ["Delivery Fee:", document.deliveryFee === 0 ? "FREE" : formatBdt(document.deliveryFee)],
  ];
  if (document.discountAmount > 0) {
    summaryRows.push([
      document.couponCode ? `Coupon (${document.couponCode}):` : "Coupon Discount:",
      `-${formatBdt(document.discountAmount)}`,
    ]);
  }
  for (const [label, value] of summaryRows) {
    text(page, fit(regular, label, 9, 120), labelX, y, 9, regular, COLORS.muted);
    textRight(page, value, COLUMNS.totalRight, y, 9, regular, COLORS.text);
    y -= 16;
  }
  y -= 6;
  page.drawRectangle({ x: labelX - 10, y: y - 8, width: width - MARGIN - labelX + 10, height: 26, color: COLORS.primary });
  text(page, "GRAND TOTAL:", labelX, y, 10, bold, COLORS.white);
  textRight(page, formatBdt(document.total), COLUMNS.totalRight, y, 10, bold, COLORS.white);

  y -= 46;
  if (y > FOOTER_HEIGHT + 30) {
    text(page, "Customer Policy & Return Terms:", MARGIN, y, 8.5, bold, COLORS.text);
    text(
      page,
      "- Perishable items, hygiene goods and opened baby formula cannot be returned once unsealed.",
      MARGIN,
      y - 13,
      8,
      regular,
      COLORS.muted,
    );
    text(
      page,
      "- Please report discrepancies or damage to My Oxygen support within 48 hours of delivery.",
      MARGIN,
      y - 25,
      8,
      regular,
      COLORS.muted,
    );
  }

  // ---- Footer on every page ----
  const pages = pdf.getPages();
  pages.forEach((target, index) => {
    target.drawLine({ start: { x: MARGIN, y: 55 }, end: { x: width - MARGIN, y: 55 }, thickness: 0.5, color: COLORS.border });
    text(
      target,
      `Thank you for trusting ${BRAND.name}. Inquiries: ${BRAND.supportEmail} | ${BRAND.supportPhone}`,
      MARGIN,
      40,
      8,
      regular,
      COLORS.muted,
    );
    text(target, BRAND.website, MARGIN, 28, 7.5, regular, COLORS.primary);
    textRight(target, `Page ${index + 1} of ${pages.length}`, width - MARGIN, 28, 7.5, regular, COLORS.muted);
  });

  return pdf.save();
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export function invoiceNumberFor(orderNumber: string): string {
  return `INV-${orderNumber.replace(/^ORD-/, "")}`;
}

export function buildInvoiceDocument(order: OrderDetailDTO, issuedAt: Date = new Date()): InvoiceDocument {
  const address = order.shippingAddress;
  return {
    invoiceNumber: invoiceNumberFor(order.orderNumber),
    orderNumber: order.orderNumber,
    issuedAt,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customer: {
      name: address.fullName || order.customer.fullName,
      phone: address.phone || order.customer.phone,
      email: order.customer.email,
      address: formatShippingAddress(address),
    },
    items: order.items.map((item) => ({
      title: item.productTitle,
      sku: item.productSku,
      batchNumber: item.batchNumber,
      expiryDate: item.batchExpiryDate,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    })),
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discountAmount: order.discountAmount,
    couponCode: order.couponCode,
    total: order.total,
  };
}

const snapshotMoney = z.union([z.number(), z.string()]).transform((value) => moneyToNumber(value));
const snapshotSchema = z.array(
  z
    .object({
      orderItemId: z.string().nullish(),
      id: z.string().nullish(),
      productId: z.string().nullish(),
      title: z.string().catch("Product"),
      sku: z.string().nullish(),
      batchNumber: z.string().nullish(),
      expiryDate: z.string().nullish(),
      quantity: z.coerce.number().int().catch(0),
      unitPrice: snapshotMoney.catch(0),
      totalPrice: snapshotMoney.catch(0),
    })
    .passthrough(),
);

/** Reads items_snapshot (current and legacy shapes) into the DTO shape. */
export function readItemsSnapshot(value: unknown): InvoiceItemSnapshot[] {
  const parsed = snapshotSchema.safeParse(value);
  if (!parsed.success) return [];
  return parsed.data.map((item) => ({
    orderItemId: item.orderItemId ?? item.id ?? null,
    productId: item.productId ?? null,
    title: item.title,
    sku: item.sku ?? null,
    batchNumber: item.batchNumber ?? null,
    expiryDate: item.expiryDate ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.totalPrice,
  }));
}

function decodePdf(base64: string): Uint8Array {
  return new Uint8Array(Buffer.from(base64, "base64"));
}

/** Body + headers for streaming an invoice PDF inline. */
export function pdfDownload(file: InvoicePdf, filename: string): {
  body: Uint8Array<ArrayBuffer>;
  headers: Record<string, string>;
} {
  const body = new Uint8Array(file.pdf);
  const safeName = filename.replace(/[^A-Za-z0-9._-]/g, "_");
  return {
    body,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
    },
  };
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invoiceLookup(idOrNumber: string): SQL {
  const value = idOrNumber.trim();
  return UUID_PATTERN.test(value) ? eq(invoices.id, value.toLowerCase()) : eq(invoices.invoiceNumber, value.toUpperCase());
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class InvoiceService {
  /** Builds and stores (upserts) the invoice of an order. */
  async generateForOrder(orderId: string): Promise<{ invoice: InvoiceRecord; pdf: Uint8Array }> {
    const order = await orderService.getOrderDetail(orderId, SYSTEM_ORDER_VIEWER);
    const document = buildInvoiceDocument(order);
    const pdf = await renderInvoicePdf(document);

    const itemsSnapshot: InvoiceItemSnapshot[] = order.items.map((item) => ({
      orderItemId: item.id,
      productId: item.productId,
      title: item.productTitle,
      sku: item.productSku,
      batchNumber: item.batchNumber,
      expiryDate: item.batchExpiryDate,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
    }));
    const values = {
      customerName: document.customer.name.slice(0, 255) || "Customer",
      customerPhone: (document.customer.phone || "N/A").slice(0, 32),
      customerAddress: document.customer.address || "N/A",
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      subtotal: order.subtotal.toFixed(2),
      discountAmount: order.discountAmount.toFixed(2),
      deliveryFee: order.deliveryFee.toFixed(2),
      totalAmount: order.total.toFixed(2),
      itemsSnapshot,
      pdfBase64: Buffer.from(pdf).toString("base64"),
    };

    const invoice = await db.transaction(async (tx) => {
      const [saved] = await tx
        .insert(invoices)
        .values({ ...values, invoiceNumber: document.invoiceNumber, orderId: order.id, userId: order.userId })
        .onConflictDoUpdate({ target: invoices.orderId, set: values })
        .returning();
      await tx.update(orders).set({ pdfInvoiceUrl: order.invoiceUrl }).where(eq(orders.id, order.id));
      return saved;
    });
    if (invoice === undefined) {
      throw AppError.internal("Invoice could not be saved");
    }
    return { invoice, pdf };
  }

  /** Background job: create the invoice if missing (or rebuild it when `regenerate`). */
  async ensureInvoice(orderId: string, regenerate = false): Promise<void> {
    if (!regenerate) {
      const [existing] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.orderId, orderId), sql`${invoices.pdfBase64} IS NOT NULL`))
        .limit(1);
      if (existing) return;
    }
    await this.generateForOrder(orderId);
  }

  /**
   * Stored PDF of an order. A missing PDF is generated on demand only when
   * `canGenerate` (the order's owner, or staff with INVOICE_GENERATE);
   * otherwise 404, matching `getInvoicePdf`.
   */
  async getOrCreateOrderPdf(orderId: string, canGenerate = true): Promise<InvoicePdf> {
    const [stored] = await db
      .select({ invoiceNumber: invoices.invoiceNumber, pdfBase64: invoices.pdfBase64, orderNumber: orders.orderNumber })
      .from(invoices)
      .innerJoin(orders, eq(orders.id, invoices.orderId))
      .where(eq(invoices.orderId, orderId))
      .limit(1);
    if (stored?.pdfBase64) {
      return { invoiceNumber: stored.invoiceNumber, orderNumber: stored.orderNumber, pdf: decodePdf(stored.pdfBase64) };
    }
    if (!canGenerate) {
      throw AppError.notFound("Invoice");
    }
    const { invoice, pdf } = await this.generateForOrder(orderId);
    const [order] = await db.select({ orderNumber: orders.orderNumber }).from(orders).where(eq(orders.id, orderId));
    return { invoiceNumber: invoice.invoiceNumber, orderNumber: order?.orderNumber ?? null, pdf };
  }

  /**
   * PDF of an invoice (by id or invoice number) for staff. A missing PDF is
   * only (re)generated when the caller may generate invoices; otherwise 404.
   */
  async getInvoicePdf(idOrNumber: string, canGenerate: boolean): Promise<InvoicePdf> {
    const [record] = await db
      .select({
        orderId: invoices.orderId,
        invoiceNumber: invoices.invoiceNumber,
        pdfBase64: invoices.pdfBase64,
        orderNumber: orders.orderNumber,
      })
      .from(invoices)
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .where(invoiceLookup(idOrNumber))
      .limit(1);
    if (!record) throw AppError.notFound("Invoice");
    if (record.pdfBase64) {
      return { invoiceNumber: record.invoiceNumber, orderNumber: record.orderNumber, pdf: decodePdf(record.pdfBase64) };
    }
    if (!canGenerate) {
      throw AppError.notFound("Invoice PDF", { reason: "The PDF has not been generated yet" });
    }
    const { invoice, pdf } = await this.generateForOrder(record.orderId);
    return { invoiceNumber: invoice.invoiceNumber, orderNumber: record.orderNumber, pdf };
  }

  async listInvoices(query: InvoiceListQuery): Promise<{ items: InvoiceListItemDTO[]; total: number }> {
    const conditions: SQL[] = [];
    if (query.paymentStatus) conditions.push(eq(invoices.paymentStatus, query.paymentStatus));
    if (query.paymentMethod === "COD") {
      conditions.push(sql`${invoices.paymentMethod} IN ('COD', 'CASH_ON_DELIVERY')`);
    } else if (query.paymentMethod) {
      conditions.push(eq(invoices.paymentMethod, query.paymentMethod));
    }
    if (query.from) conditions.push(onOrAfterBusinessDay(invoices.createdAt, query.from));
    if (query.to) conditions.push(onOrBeforeBusinessDay(invoices.createdAt, query.to));
    if (query.q) {
      const pattern = containsPattern(query.q);
      const phone = normalizeBangladeshMobile(query.q);
      const phonePattern = phone === null ? pattern : `%${phone}%`;
      conditions.push(
        sql`(${invoices.invoiceNumber} ILIKE ${pattern} OR ${invoices.customerName} ILIKE ${pattern}
          OR ${invoices.customerPhone} ILIKE ${phonePattern} OR ${orders.orderNumber} ILIKE ${pattern})`,
      );
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [totalRow] = await db
      .select({ value: count() })
      .from(invoices)
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .where(where);
    const rows = await db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        orderId: invoices.orderId,
        orderNumber: orders.orderNumber,
        userId: invoices.userId,
        customerName: invoices.customerName,
        customerPhone: invoices.customerPhone,
        customerAddress: invoices.customerAddress,
        paymentMethod: invoices.paymentMethod,
        paymentStatus: invoices.paymentStatus,
        subtotal: invoices.subtotal,
        discountAmount: invoices.discountAmount,
        deliveryFee: invoices.deliveryFee,
        totalAmount: invoices.totalAmount,
        itemsSnapshot: invoices.itemsSnapshot,
        hasPdf: sql<boolean>`(${invoices.pdfBase64} IS NOT NULL)`,
        createdAt: invoices.createdAt,
        updatedAt: invoices.updatedAt,
      })
      .from(invoices)
      .leftJoin(orders, eq(orders.id, invoices.orderId))
      .where(where)
      .orderBy(desc(invoices.createdAt), desc(invoices.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);

    return {
      total: Number(totalRow?.value ?? 0),
      items: rows.map((row) => {
        const snapshot = readItemsSnapshot(row.itemsSnapshot);
        return {
          id: row.id,
          invoiceNumber: row.invoiceNumber,
          orderId: row.orderId,
          orderNumber: row.orderNumber,
          userId: row.userId,
          customerName: row.customerName,
          customerPhone: row.customerPhone,
          customerAddress: row.customerAddress,
          paymentMethod: row.paymentMethod,
          paymentStatus: row.paymentStatus,
          subtotal: moneyToNumber(row.subtotal),
          discountAmount: moneyToNumber(row.discountAmount),
          deliveryFee: moneyToNumber(row.deliveryFee),
          totalAmount: moneyToNumber(row.totalAmount),
          itemCount: snapshot.reduce((sum, item) => sum + item.quantity, 0),
          hasPdf: Boolean(row.hasPdf),
          createdAt: row.createdAt.toISOString(),
          updatedAt: row.updatedAt.toISOString(),
        };
      }),
    };
  }

  async getSummary(): Promise<InvoiceSummaryDTO> {
    const [row] = await db
      .select({
        totalInvoices: count(),
        totalBilled: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
        codCount: sql<string>`count(*) FILTER (WHERE ${invoices.paymentMethod} IN ('COD', 'CASH_ON_DELIVERY'))`,
        onlineCount: sql<string>`count(*) FILTER (WHERE ${invoices.paymentMethod} = 'ONLINE_GATEWAY')`,
      })
      .from(invoices);
    return {
      totalInvoices: Number(row?.totalInvoices ?? 0),
      totalBilledAmount: paisaToAmount(toPaisa(row?.totalBilled ?? "0")),
      codCount: Number(row?.codCount ?? 0),
      onlineCount: Number(row?.onlineCount ?? 0),
    };
  }

  async getInvoiceDetail(idOrNumber: string): Promise<InvoiceDetailDTO> {
    const record = await db.query.invoices.findFirst({
      where: invoiceLookup(idOrNumber),
      columns: { pdfBase64: false },
      extras: { hasPdf: sql<boolean>`(${invoices.pdfBase64} IS NOT NULL)`.as("has_pdf") },
      with: {
        order: {
          columns: {
            id: true,
            orderNumber: true,
            status: true,
            paymentStatus: true,
            trackingId: true,
            courierProvider: true,
            createdAt: true,
          },
        },
      },
    });
    if (!record) throw AppError.notFound("Invoice");

    const items = readItemsSnapshot(record.itemsSnapshot);
    return {
      id: record.id,
      invoiceNumber: record.invoiceNumber,
      orderId: record.orderId,
      orderNumber: record.order?.orderNumber ?? null,
      userId: record.userId,
      customerName: record.customerName,
      customerPhone: record.customerPhone,
      customerAddress: record.customerAddress,
      paymentMethod: record.paymentMethod,
      paymentStatus: record.paymentStatus,
      subtotal: moneyToNumber(record.subtotal),
      discountAmount: moneyToNumber(record.discountAmount),
      deliveryFee: moneyToNumber(record.deliveryFee),
      totalAmount: moneyToNumber(record.totalAmount),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      hasPdf: Boolean(record.hasPdf),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      items,
      order: record.order
        ? {
            id: record.order.id,
            orderNumber: record.order.orderNumber,
            status: record.order.status,
            paymentStatus: record.order.paymentStatus,
            trackingId: record.order.trackingId,
            courierProvider: record.order.courierProvider,
            createdAt: record.order.createdAt.toISOString(),
          }
        : null,
    };
  }
}

export const invoiceService = new InvoiceService();
