import { describe, expect, it, afterAll } from "bun:test";
import { invoiceService, type InvoiceOrderData } from "./invoice.service";
import { existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

describe("InvoiceService - Branded PDF Invoice Generator", () => {
  const sampleOrder: InvoiceOrderData = {
    id: "f88031dc-293e-4fa0-827c-9b986a42a001",
    orderNumber: "ORD-1727000000000-4321",
    createdAt: new Date("2026-09-22T10:30:00Z"),
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "UNPAID",
    shippingAddress: {
      recipientName: "Tasnim Sultana",
      phone: "01812345678",
      addressLine1: "Flat 4B, Green Heritage",
      addressLine2: "Dhanmondi 8/A",
      city: "Dhaka",
      postalCode: "1209",
    },
    subtotal: "2400.00",
    deliveryFee: "0.00",
    discountAmount: "200.00",
    total: "2200.00",
    user: {
      fullName: "Tasnim Sultana",
      email: "tasnim@example.com",
      phone: "01812345678",
    },
    items: [
      {
        id: "item-1",
        quantity: 2,
        unitPrice: "850.00",
        totalPrice: "1700.00",
        product: {
          id: "prod-1",
          title: "Organic Baby Massage Oil 200ml",
          sku: "OIL-BABY-200",
          basePrice: "850.00",
        },
        batch: {
          id: "batch-1",
          batchNumber: "B2026-09A",
          expiryDate: new Date("2028-06-30"),
        },
      },
      {
        id: "item-2",
        quantity: 1,
        unitPrice: "700.00",
        totalPrice: "700.00",
        product: {
          id: "prod-2",
          title: "Gentle Newborn Cotton Wipes (Pack of 3)",
          sku: "WIPES-COT-3PK",
          basePrice: "700.00",
        },
        batch: {
          id: "batch-2",
          batchNumber: "B2026-08C",
          expiryDate: new Date("2027-12-31"),
        },
      },
    ],
  };

  const createdFilePaths: string[] = [];

  afterAll(() => {
    // Clean up test generated invoice files
    for (const p of createdFilePaths) {
      const fullPath = join(process.cwd(), p);
      if (existsSync(fullPath)) {
        try {
          unlinkSync(fullPath);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  });

  it("should generate a valid PDF buffer starting with %PDF- header", async () => {
    const pdfBytes = await invoiceService.generateInvoicePdf(sampleOrder);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    expect(pdfBytes.length).toBeGreaterThan(1000);

    // Verify PDF header magic bytes %PDF-
    const headerString = new TextDecoder().decode(pdfBytes.subarray(0, 5));
    expect(headerString).toBe("%PDF-");
  });

  it("should save the generated PDF invoice to disk in uploads/invoices", async () => {
    const pdfBytes = await invoiceService.generateInvoicePdf(sampleOrder);
    const relativePath = await invoiceService.saveInvoiceToDisk(
      sampleOrder.id,
      pdfBytes,
    );

    createdFilePaths.push(relativePath);

    expect(relativePath).toBe(`uploads/invoices/invoice-${sampleOrder.id}.pdf`);
    const fullPath = join(process.cwd(), relativePath);
    expect(existsSync(fullPath)).toBe(true);
  });

  it("should render successfully with minimal order data without throwing", async () => {
    const minimalOrder: InvoiceOrderData = {
      id: "min-order-123",
      orderNumber: "ORD-MIN-100",
      createdAt: new Date().toISOString(),
      paymentMethod: "COD",
      paymentStatus: "PAID",
      shippingAddress: "House 1, Road 2, Gulshan",
      subtotal: "500.00",
      deliveryFee: "60.00",
      discountAmount: "0.00",
      total: "560.00",
      user: null,
      items: [
        {
          id: "item-min-1",
          quantity: 1,
          unitPrice: "500.00",
          totalPrice: "500.00",
          product: null,
          batch: null,
        },
      ],
    };

    const pdfBytes = await invoiceService.generateInvoicePdf(minimalOrder);
    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    const headerString = new TextDecoder().decode(pdfBytes.subarray(0, 5));
    expect(headerString).toBe("%PDF-");
  });
});
