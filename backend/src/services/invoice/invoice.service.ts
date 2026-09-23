import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, invoices } from "../../db";
import { eq, desc } from "drizzle-orm";

export interface InvoiceCustomer {
  fullName?: string;
  email?: string;
  phone?: string;
}

export interface InvoiceShippingAddress {
  recipientName?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  [key: string]: any;
}

export interface InvoiceItem {
  id: string;
  quantity: number;
  unitPrice: string | number;
  totalPrice: string | number;
  product?: {
    id: string;
    title: string;
    sku?: string;
    basePrice?: string | number;
  } | null;
  batch?: {
    id: string;
    batchNumber: string;
    expiryDate: string | Date;
  } | null;
}

export interface InvoiceOrderData {
  id: string;
  orderNumber: string;
  createdAt: Date | string;
  paymentMethod: string;
  paymentStatus: string;
  shippingAddress: InvoiceShippingAddress | string | null;
  subtotal: string | number;
  deliveryFee: string | number;
  discountAmount: string | number;
  total: string | number;
  userId?: string | null;
  user?: InvoiceCustomer | null;
  items: InvoiceItem[];
}

function safeAscii(str: unknown, fallback = ""): string {
  if (str == null) return fallback;
  return String(str)
    .replace(/৳/g, "BDT ")
    .replace(/[^\x20-\x7E]/g, " ")
    .trim();
}

function formatCurrency(amount: string | number): string {
  const num = typeof amount === "number" ? amount : parseFloat(amount || "0");
  return `BDT ${num.toFixed(2)}`;
}

function formatDate(dateInput: Date | string | undefined): string {
  if (!dateInput) return new Date().toISOString().split("T")[0];
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return String(dateInput);
  return d.toISOString().split("T")[0];
}

export class InvoiceService {
  /**
   * Generates an A4 PDF invoice for an order using pdf-lib.
   */
  async generateInvoicePdf(order: InvoiceOrderData): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    // A4 dimensions: 595.28 x 841.89 pt
    const page = pdfDoc.addPage([595.28, 841.89]);
    const { width, height } = page.getSize();

    const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // Color Palette
    const primaryPink = rgb(255 / 255, 107 / 255, 139 / 255); // #FF6B8B
    const darkText = rgb(0.15, 0.15, 0.18);
    const mutedText = rgb(0.45, 0.45, 0.5);
    const lightGray = rgb(0.95, 0.95, 0.96);
    const borderGray = rgb(0.85, 0.85, 0.88);

    // ──────────────────────────────────────────────
    // 1. Brand Banner Header (Top)
    // ──────────────────────────────────────────────
    const headerHeight = 85;
    page.drawRectangle({
      x: 0,
      y: height - headerHeight,
      width: width,
      height: headerHeight,
      color: primaryPink,
    });

    // Brand Logo & Subtitle
    page.drawText("MY OXYGEN", {
      x: 40,
      y: height - 42,
      size: 22,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("Premium Mother & Baby Care Essentials", {
      x: 40,
      y: height - 60,
      size: 10,
      font: fontRegular,
      color: rgb(1, 1, 1),
    });

    // "INVOICE" Header Label
    page.drawText("INVOICE", {
      x: width - 130,
      y: height - 44,
      size: 20,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText("TAX INVOICE / CASH MEMO", {
      x: width - 170,
      y: height - 60,
      size: 8,
      font: fontRegular,
      color: rgb(1, 1, 1),
    });

    // ──────────────────────────────────────────────
    // 2. Metadata & Customer Billing Columns
    // ──────────────────────────────────────────────
    const sectionTop = height - headerHeight - 25;

    // Left Box: Bill To
    let customerName = safeAscii(order.user?.fullName);
    let customerPhone = safeAscii(order.user?.phone);
    let addressLine = "";
    let cityPostal = "";

    if (order.shippingAddress) {
      if (typeof order.shippingAddress === "object") {
        customerName =
          safeAscii(order.shippingAddress.recipientName) || customerName;
        customerPhone =
          safeAscii(order.shippingAddress.phone) || customerPhone;
        const addr1 = safeAscii(order.shippingAddress.addressLine1);
        const addr2 = safeAscii(order.shippingAddress.addressLine2);
        addressLine = [addr1, addr2].filter(Boolean).join(", ");
        const city = safeAscii(order.shippingAddress.city);
        const postal = safeAscii(order.shippingAddress.postalCode);
        cityPostal = [city, postal].filter(Boolean).join(" - ");
      } else {
        addressLine = safeAscii(order.shippingAddress);
      }
    }

    page.drawText("BILL TO", {
      x: 40,
      y: sectionTop,
      size: 9,
      font: fontBold,
      color: primaryPink,
    });

    page.drawText(customerName || "Customer", {
      x: 40,
      y: sectionTop - 16,
      size: 11,
      font: fontBold,
      color: darkText,
    });

    let currentLeftY = sectionTop - 32;
    if (customerPhone) {
      page.drawText(`Phone: ${customerPhone}`, {
        x: 40,
        y: currentLeftY,
        size: 9,
        font: fontRegular,
        color: mutedText,
      });
      currentLeftY -= 14;
    }

    if (order.user?.email) {
      page.drawText(`Email: ${safeAscii(order.user.email)}`, {
        x: 40,
        y: currentLeftY,
        size: 9,
        font: fontRegular,
        color: mutedText,
      });
      currentLeftY -= 14;
    }

    if (addressLine) {
      page.drawText(`Address: ${addressLine.slice(0, 45)}`, {
        x: 40,
        y: currentLeftY,
        size: 9,
        font: fontRegular,
        color: mutedText,
      });
      currentLeftY -= 14;
    }

    if (cityPostal) {
      page.drawText(`City: ${cityPostal}`, {
        x: 40,
        y: currentLeftY,
        size: 9,
        font: fontRegular,
        color: mutedText,
      });
      currentLeftY -= 14;
    }

    // Right Box: Order & Invoice Details
    const metaX = 350;
    page.drawText("ORDER DETAILS", {
      x: metaX,
      y: sectionTop,
      size: 9,
      font: fontBold,
      color: primaryPink,
    });

    const invoiceNumber = `INV-${order.orderNumber.replace(/^ORD-/, "")}`;
    const invoiceDate = formatDate(order.createdAt);

    const metaRows: Array<[string, string]> = [
      ["Invoice No:", invoiceNumber],
      ["Order No:", safeAscii(order.orderNumber)],
      ["Invoice Date:", invoiceDate],
      ["Payment Method:", safeAscii(order.paymentMethod)],
      ["Payment Status:", safeAscii(order.paymentStatus)],
    ];

    let currentMetaY = sectionTop - 16;
    for (const [label, val] of metaRows) {
      page.drawText(label, {
        x: metaX,
        y: currentMetaY,
        size: 9,
        font: fontRegular,
        color: mutedText,
      });
      page.drawText(val, {
        x: metaX + 90,
        y: currentMetaY,
        size: 9,
        font: fontBold,
        color: darkText,
      });
      currentMetaY -= 14;
    }

    // ──────────────────────────────────────────────
    // 3. Itemized Products Table
    // ──────────────────────────────────────────────
    const tableTopY = Math.min(currentLeftY, currentMetaY) - 20;
    const tableHeaderHeight = 22;

    // Header Background
    page.drawRectangle({
      x: 40,
      y: tableTopY - tableHeaderHeight,
      width: width - 80,
      height: tableHeaderHeight,
      color: lightGray,
    });

    // Column positions
    const colItemX = 50;
    const colBatchX = 250;
    const colQtyX = 370;
    const colPriceX = 425;
    const colTotalX = 495;

    page.drawText("ITEM DESCRIPTION", {
      x: colItemX,
      y: tableTopY - 15,
      size: 8,
      font: fontBold,
      color: darkText,
    });
    page.drawText("BATCH / EXP", {
      x: colBatchX,
      y: tableTopY - 15,
      size: 8,
      font: fontBold,
      color: darkText,
    });
    page.drawText("QTY", {
      x: colQtyX,
      y: tableTopY - 15,
      size: 8,
      font: fontBold,
      color: darkText,
    });
    page.drawText("UNIT (BDT)", {
      x: colPriceX,
      y: tableTopY - 15,
      size: 8,
      font: fontBold,
      color: darkText,
    });
    page.drawText("TOTAL (BDT)", {
      x: colTotalX,
      y: tableTopY - 15,
      size: 8,
      font: fontBold,
      color: darkText,
    });

    let currentTableY = tableTopY - tableHeaderHeight;
    const rowHeight = 24;

    for (const item of order.items) {
      currentTableY -= rowHeight;

      // Draw light bottom border for row
      page.drawLine({
        start: { x: 40, y: currentTableY },
        end: { x: width - 40, y: currentTableY },
        thickness: 0.5,
        color: borderGray,
      });

      const itemTitle = safeAscii(
        item.product?.title || `Product #${item.id.slice(0, 8)}`,
      );
      const truncatedTitle =
        itemTitle.length > 34 ? `${itemTitle.slice(0, 31)}...` : itemTitle;

      page.drawText(truncatedTitle, {
        x: colItemX,
        y: currentTableY + 8,
        size: 8.5,
        font: fontRegular,
        color: darkText,
      });

      // Batch & Expiry
      let batchText = "Standard Stock";
      if (item.batch?.batchNumber) {
        const expStr = item.batch.expiryDate
          ? formatDate(item.batch.expiryDate)
          : "";
        batchText = `${safeAscii(item.batch.batchNumber)}${expStr ? ` (Exp: ${expStr})` : ""}`;
      }
      const truncatedBatch =
        batchText.length > 22 ? `${batchText.slice(0, 20)}..` : batchText;

      page.drawText(truncatedBatch, {
        x: colBatchX,
        y: currentTableY + 8,
        size: 8,
        font: fontRegular,
        color: mutedText,
      });

      // Qty
      page.drawText(String(item.quantity), {
        x: colQtyX + 5,
        y: currentTableY + 8,
        size: 8.5,
        font: fontRegular,
        color: darkText,
      });

      // Unit Price
      const unitPriceStr = parseFloat(String(item.unitPrice || 0)).toFixed(2);
      page.drawText(unitPriceStr, {
        x: colPriceX + 5,
        y: currentTableY + 8,
        size: 8.5,
        font: fontRegular,
        color: darkText,
      });

      // Total Price
      const totalPriceStr = parseFloat(String(item.totalPrice || 0)).toFixed(2);
      page.drawText(totalPriceStr, {
        x: colTotalX + 5,
        y: currentTableY + 8,
        size: 8.5,
        font: fontBold,
        color: darkText,
      });
    }

    // ──────────────────────────────────────────────
    // 4. Totals & Financial Summary Box
    // ──────────────────────────────────────────────
    const summaryTopY = currentTableY - 20;
    const summaryLeftX = 340;
    const summaryRightX = width - 50;

    const subtotal = parseFloat(String(order.subtotal || 0));
    const deliveryFee = parseFloat(String(order.deliveryFee || 0));
    const discountAmount = parseFloat(String(order.discountAmount || 0));
    const grandTotal = parseFloat(String(order.total || 0));

    const summaryRows: Array<{ label: string; value: string; bold?: boolean }> = [
      { label: "Subtotal:", value: formatCurrency(subtotal) },
      {
        label: "Delivery Fee:",
        value: deliveryFee === 0 ? "BDT 0.00 (FREE)" : formatCurrency(deliveryFee),
      },
    ];

    if (discountAmount > 0) {
      summaryRows.push({
        label: "Coupon Discount:",
        value: `-${formatCurrency(discountAmount)}`,
      });
    }

    let currentSummaryY = summaryTopY;
    for (const row of summaryRows) {
      page.drawText(row.label, {
        x: summaryLeftX,
        y: currentSummaryY,
        size: 9,
        font: fontRegular,
        color: mutedText,
      });

      page.drawText(row.value, {
        x: summaryRightX - 80,
        y: currentSummaryY,
        size: 9,
        font: fontRegular,
        color: darkText,
      });
      currentSummaryY -= 16;
    }

    // Grand Total Highlight Banner
    currentSummaryY -= 6;
    page.drawRectangle({
      x: summaryLeftX - 10,
      y: currentSummaryY - 8,
      width: width - summaryLeftX - 30,
      height: 26,
      color: primaryPink,
    });

    page.drawText("GRAND TOTAL:", {
      x: summaryLeftX,
      y: currentSummaryY,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    page.drawText(formatCurrency(grandTotal), {
      x: summaryRightX - 80,
      y: currentSummaryY,
      size: 10,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    // ──────────────────────────────────────────────
    // 5. Policies & Brand Guarantee
    // ──────────────────────────────────────────────
    const policyY = currentSummaryY - 50;
    page.drawText("Customer Policy & Return Terms:", {
      x: 40,
      y: policyY,
      size: 8.5,
      font: fontBold,
      color: darkText,
    });

    page.drawText(
      "- Perishable items, hygiene goods, and opened baby formulas cannot be returned once unsealed.",
      {
        x: 40,
        y: policyY - 14,
        size: 8,
        font: fontRegular,
        color: mutedText,
      },
    );

    page.drawText(
      "- Any discrepancies or damages must be reported to My Oxygen support within 48 hours of delivery.",
      {
        x: 40,
        y: policyY - 26,
        size: 8,
        font: fontRegular,
        color: mutedText,
      },
    );

    // ──────────────────────────────────────────────
    // 6. Professional Footer
    // ──────────────────────────────────────────────
    page.drawLine({
      start: { x: 40, y: 55 },
      end: { x: width - 40, y: 55 },
      thickness: 0.5,
      color: borderGray,
    });

    page.drawText(
      "Thank you for trusting My Oxygen. Inquiries: support@myoxygen.com | +880 1700-000000",
      {
        x: 100,
        y: 40,
        size: 8.5,
        font: fontRegular,
        color: mutedText,
      },
    );

    page.drawText("myoxygen.com - Premium Mother & Baby Care", {
      x: 180,
      y: 28,
      size: 7.5,
      font: fontRegular,
      color: primaryPink,
    });

    return await pdfDoc.save();
  }

  /**
   * Pure Database Storage: Saves generated invoice metadata and Base64 PDF to PostgreSQL/Supabase.
   * Completely avoids writing files to backend local disk.
   */
  async saveInvoiceToDb(
    orderId: string,
    orderData: InvoiceOrderData,
    pdfBytes: Uint8Array,
  ) {
    let customerName = orderData.user?.fullName || "Valued Customer";
    let customerPhone = orderData.user?.phone || "";
    let customerAddress = "";

    if (orderData.shippingAddress) {
      if (typeof orderData.shippingAddress === "object") {
        customerName = orderData.shippingAddress.recipientName || customerName;
        customerPhone = orderData.shippingAddress.phone || customerPhone;
        const addr1 = orderData.shippingAddress.addressLine1 || "";
        const addr2 = orderData.shippingAddress.addressLine2 || "";
        const city = orderData.shippingAddress.city || "";
        const postal = orderData.shippingAddress.postalCode || "";
        customerAddress = [addr1, addr2, city, postal].filter(Boolean).join(", ");
      } else {
        customerAddress = String(orderData.shippingAddress);
      }
    }

    const itemsSnapshot = (orderData.items || []).map((item) => ({
      id: item.id,
      productId: item.product?.id || null,
      title: item.product?.title || `Product #${item.id.slice(0, 8)}`,
      sku: item.product?.sku || null,
      batchNumber: item.batch?.batchNumber || null,
      expiryDate: item.batch?.expiryDate ? formatDate(item.batch.expiryDate) : null,
      quantity: item.quantity,
      unitPrice: parseFloat(String(item.unitPrice || 0)).toFixed(2),
      totalPrice: parseFloat(String(item.totalPrice || 0)).toFixed(2),
    }));

    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");
    const invoiceNumber = `INV-${orderData.orderNumber.replace(/^ORD-/, "")}`;

    const subtotal = parseFloat(String(orderData.subtotal || 0)).toFixed(2);
    const discountAmount = parseFloat(String(orderData.discountAmount || 0)).toFixed(2);
    const deliveryFee = parseFloat(String(orderData.deliveryFee || 0)).toFixed(2);
    const totalAmount = parseFloat(String(orderData.total || 0)).toFixed(2);

    const [saved] = await db
      .insert(invoices)
      .values({
        invoiceNumber,
        orderId,
        userId: orderData.userId ?? (orderData.user as any)?.id ?? null,
        customerName: customerName || "Customer",
        customerPhone: customerPhone || "N/A",
        customerAddress: customerAddress || "N/A",
        paymentMethod: orderData.paymentMethod || "CASH_ON_DELIVERY",
        paymentStatus: orderData.paymentStatus || "PENDING",
        subtotal,
        discountAmount,
        deliveryFee,
        totalAmount,
        itemsSnapshot,
        pdfBase64,
      })
      .onConflictDoUpdate({
        target: invoices.orderId,
        set: {
          customerName: customerName || "Customer",
          customerPhone: customerPhone || "N/A",
          customerAddress: customerAddress || "N/A",
          paymentMethod: orderData.paymentMethod || "CASH_ON_DELIVERY",
          paymentStatus: orderData.paymentStatus || "PENDING",
          subtotal,
          discountAmount,
          deliveryFee,
          totalAmount,
          itemsSnapshot,
          pdfBase64,
          updatedAt: new Date(),
        },
      })
      .returning();

    return saved;
  }

  async getInvoiceByOrderId(orderId: string) {
    return await db.query.invoices.findFirst({
      where: eq(invoices.orderId, orderId),
    });
  }

  async getInvoiceById(id: string) {
    return await db.query.invoices.findFirst({
      where: eq(invoices.id, id),
    });
  }

  async getInvoiceByNumber(invoiceNumber: string) {
    return await db.query.invoices.findFirst({
      where: eq(invoices.invoiceNumber, invoiceNumber),
    });
  }

  /**
   * Generates PDF and persists directly into PostgreSQL database.
   */
  async generateAndSaveInvoice(orderData: InvoiceOrderData) {
    const pdfBytes = await this.generateInvoicePdf(orderData);
    const invoice = await this.saveInvoiceToDb(orderData.id, orderData, pdfBytes);
    return { invoice, pdfBytes };
  }

  /**
   * @deprecated Legacy disk fallback. Application now stores PDFs purely in DB.
   */
  async saveInvoiceToDisk(
    orderId: string,
    pdfBytes: Uint8Array,
  ): Promise<string> {
    const uploadDir = join(process.cwd(), "uploads", "invoices");
    await mkdir(uploadDir, { recursive: true });

    const fileName = `invoice-${orderId}.pdf`;
    const fullPath = join(uploadDir, fileName);
    await writeFile(fullPath, pdfBytes);

    return `uploads/invoices/${fileName}`;
  }
}

export const invoiceService = new InvoiceService();
