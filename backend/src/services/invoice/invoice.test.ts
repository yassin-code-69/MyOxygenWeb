import { describe, expect, it } from "bun:test";
import { PDFDocument } from "pdf-lib";
import type { OrderDetailDTO } from "../order-dto";
import {
  buildInvoiceDocument,
  invoiceNumberFor,
  pdfSafeText,
  readItemsSnapshot,
  renderInvoicePdf,
  type InvoiceDocument,
} from "./invoice.service";

const baseDocument: InvoiceDocument = {
  invoiceNumber: "INV-20260922-ABCD2345",
  orderNumber: "ORD-20260922-ABCD2345",
  issuedAt: new Date("2026-09-22T10:30:00Z"),
  paymentMethod: "COD",
  paymentStatus: "UNPAID",
  customer: {
    name: "Tasnim Sultana",
    phone: "01812345678",
    email: "tasnim@example.com",
    address: "Flat 4B, Green Heritage, Dhanmondi 8/A, Dhaka, Dhaka, 1209",
  },
  items: [
    {
      title: "Organic Baby Massage Oil 200ml",
      sku: "OIL-BABY-200",
      batchNumber: "B2026-09A",
      expiryDate: "2028-06-30",
      quantity: 2,
      unitPrice: 850,
      totalPrice: 1700,
    },
  ],
  subtotal: 1700,
  deliveryFee: 0,
  discountAmount: 170,
  couponCode: "SAVE10",
  total: 1530,
};

function pdfHeader(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes.subarray(0, 5));
}

describe("Invoice PDF rendering", () => {
  it("renders a valid A4 PDF", async () => {
    const bytes = await renderInvoicePdf(baseDocument);
    expect(pdfHeader(bytes)).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
    const { width, height } = parsed.getPage(0).getSize();
    expect(Math.round(width)).toBe(595);
    expect(Math.round(height)).toBe(842);
  });

  it("paginates long invoices instead of drawing off the page", async () => {
    const items = Array.from({ length: 70 }, (_, index) => ({
      title: `Gentle Newborn Wipes Pack ${index + 1}`,
      sku: `WIPES-${index + 1}`,
      batchNumber: `B-${index + 1}`,
      expiryDate: "2027-12-31",
      quantity: 1,
      unitPrice: 100,
      totalPrice: 100,
    }));
    const bytes = await renderInvoicePdf({ ...baseDocument, items, subtotal: 7000, discountAmount: 0, total: 7000 });
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(3);
  });

  it("survives text the standard fonts cannot encode (৳, Bangla)", async () => {
    const bytes = await renderInvoicePdf({
      ...baseDocument,
      customer: { ...baseDocument.customer, name: "রহিম উদ্দিন" },
      items: baseDocument.items.map((item) => ({ ...item, title: "শিশুর লোশন ৳৫০০" })),
    });
    expect(pdfHeader(bytes)).toBe("%PDF-");
    expect(pdfSafeText("Price ৳500")).toBe("Price BDT 500");
  });
});

describe("Invoice mapping", () => {
  it("reads fullName, addressLine2 and district from the stored shipping address", () => {
    const order: OrderDetailDTO = {
      id: "f88031dc-293e-4fa0-827c-9b986a42a001",
      orderNumber: "ORD-20260922-ABCD2345",
      userId: "a88031dc-293e-4fa0-827c-9b986a42a001",
      status: "PENDING",
      paymentMethod: "COD",
      paymentStatus: "UNPAID",
      shippingAddress: {
        fullName: "Tasnim Sultana",
        phone: "01812345678",
        addressLine1: "Flat 4B, Green Heritage",
        addressLine2: "Road 8/A",
        city: "Dhaka",
        district: "Dhanmondi",
        postalCode: "1209",
      },
      subtotal: 1700,
      deliveryFee: 0,
      discountAmount: 0,
      total: 1700,
      couponCode: null,
      courierProvider: null,
      trackingId: null,
      invoiceUrl: "/orders/f88031dc-293e-4fa0-827c-9b986a42a001/invoice",
      createdAt: "2026-09-22T10:30:00.000Z",
      updatedAt: "2026-09-22T10:30:00.000Z",
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      customer: { id: "a88031dc-293e-4fa0-827c-9b986a42a001", fullName: "Account Name", email: null, phone: "01700000000" },
      items: [],
      statusHistory: [],
      allowedTransitions: ["PROCESSING", "CANCELLED"],
      canCancel: false,
    };
    const document = buildInvoiceDocument(order, new Date("2026-09-22T10:30:00Z"));
    expect(document.invoiceNumber).toBe("INV-20260922-ABCD2345");
    expect(document.customer.name).toBe("Tasnim Sultana");
    expect(document.customer.phone).toBe("01812345678");
    expect(document.customer.address).toBe("Flat 4B, Green Heritage, Road 8/A, Dhaka, Dhanmondi, 1209");
    expect(invoiceNumberFor("ORD-1727000000000-4321")).toBe("INV-1727000000000-4321");
  });

  it("reads current and legacy item snapshots with numeric money", () => {
    const items = readItemsSnapshot([
      { orderItemId: "i1", productId: "p1", title: "Wash", sku: "W", batchNumber: null, expiryDate: null, quantity: 2, unitPrice: 800, totalPrice: 1600 },
      { id: "i2", productId: null, title: "Legacy", sku: null, batchNumber: "B1", expiryDate: "2027-01-01", quantity: 1, unitPrice: "99.50", totalPrice: "99.50" },
    ]);
    expect(items).toHaveLength(2);
    expect(items[0]?.totalPrice).toBe(1600);
    expect(items[1]?.orderItemId).toBe("i2");
    expect(items[1]?.unitPrice).toBe(99.5);
    expect(readItemsSnapshot("not-an-array")).toEqual([]);
  });
});
