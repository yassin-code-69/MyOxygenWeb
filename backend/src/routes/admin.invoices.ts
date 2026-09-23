import { Hono } from "hono";
import { and, count, desc, eq, ilike, or, gte, lte, sql } from "drizzle-orm";
import { db } from "../db";
import { invoices, orders, users } from "../db/schema/tables";
import { Permissions } from "../lib/rbac";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { invoiceService } from "../services/invoice/invoice.service";
import { orderService } from "../services/order.service";

export const adminInvoicesRoute = new Hono<AuthContext>();

// All admin invoice routes enforce valid JWT authentication
adminInvoicesRoute.use("*", requireAuth);

// ─────────────────────────────────────────────────────────────
// GET /admin/invoices — Paginated Invoice Listing & Search
// ─────────────────────────────────────────────────────────────
adminInvoicesRoute.get(
  "/invoices",
  requirePermission(Permissions.ORDERS_READ),
  async (c) => {
    try {
      const page = Math.max(1, Number(c.req.query("page") || 1));
      const limit = Math.min(100, Math.max(1, Number(c.req.query("limit") || 10)));
      const offset = (page - 1) * limit;

      const q = c.req.query("q")?.trim();
      const paymentStatus = c.req.query("paymentStatus")?.trim();
      const paymentMethod = c.req.query("paymentMethod")?.trim();
      const startDate = c.req.query("startDate")?.trim();
      const endDate = c.req.query("endDate")?.trim();

      const filters = [];

      if (paymentStatus && paymentStatus !== "ALL") {
        filters.push(eq(invoices.paymentStatus, paymentStatus));
      }

      if (paymentMethod && paymentMethod !== "ALL") {
        filters.push(eq(invoices.paymentMethod, paymentMethod));
      }

      if (startDate) {
        filters.push(gte(invoices.createdAt, new Date(startDate)));
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filters.push(lte(invoices.createdAt, end));
      }

      if (q) {
        filters.push(
          or(
            ilike(invoices.invoiceNumber, `%${q}%`),
            ilike(invoices.customerName, `%${q}%`),
            ilike(invoices.customerPhone, `%${q}%`),
          ),
        );
      }

      const whereClause = filters.length > 0 ? and(...filters) : undefined;

      // Fetch paginated invoices without the bulky pdfBase64 column
      const items = await db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          orderId: invoices.orderId,
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
          hasPdf: sql<boolean>`CASE WHEN ${invoices.pdfBase64} IS NOT NULL THEN TRUE ELSE FALSE END`,
          createdAt: invoices.createdAt,
          updatedAt: invoices.updatedAt,
          orderNumber: orders.orderNumber,
        })
        .from(invoices)
        .leftJoin(orders, eq(invoices.orderId, orders.id))
        .where(whereClause)
        .orderBy(desc(invoices.createdAt))
        .limit(limit)
        .offset(offset);

      // Count matching records
      const totalResult = await db
        .select({ count: count() })
        .from(invoices)
        .where(whereClause);
      const total = Number(totalResult[0]?.count || 0);

      // Overview Summary Totals
      const summaryResult = await db
        .select({
          totalCount: count(),
          totalRevenue: sql<string>`COALESCE(SUM(${invoices.totalAmount}), 0)`,
          codCount: sql<string>`COUNT(CASE WHEN ${invoices.paymentMethod} = 'CASH_ON_DELIVERY' THEN 1 END)`,
          digitalCount: sql<string>`COUNT(CASE WHEN ${invoices.paymentMethod} != 'CASH_ON_DELIVERY' THEN 1 END)`,
        })
        .from(invoices);

      const summary = {
        totalInvoices: Number(summaryResult[0]?.totalCount || 0),
        totalBilledAmount: parseFloat(summaryResult[0]?.totalRevenue || "0").toFixed(2),
        codCount: Number(summaryResult[0]?.codCount || 0),
        digitalCount: Number(summaryResult[0]?.digitalCount || 0),
      };

      return c.json({
        success: true,
        data: {
          items,
          pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
          },
          summary,
        },
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to fetch invoices",
        },
        500,
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /admin/invoices/:id — Invoice Detail with Line Items Breakdown
// ─────────────────────────────────────────────────────────────
adminInvoicesRoute.get(
  "/invoices/:id",
  requirePermission(Permissions.ORDERS_READ),
  async (c) => {
    try {
      const id = c.req.param("id");

      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      const invoice = await db.query.invoices.findFirst({
        where: isUUID
          ? eq(invoices.id, id)
          : eq(invoices.invoiceNumber, id),
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
          user: {
            columns: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
            },
          },
        },
      });

      if (!invoice) {
        return c.json(
          {
            success: false,
            error: "Invoice not found",
          },
          404,
        );
      }

      // Omit large base64 string from JSON response to keep it performant
      const { pdfBase64, ...rest } = invoice;

      return c.json({
        success: true,
        data: {
          ...rest,
          hasPdf: Boolean(pdfBase64),
        },
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to fetch invoice details",
        },
        500,
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// GET /admin/invoices/:id/pdf — Stream Binary PDF Directly from Database
// ─────────────────────────────────────────────────────────────
adminInvoicesRoute.get(
  "/invoices/:id/pdf",
  requirePermission(Permissions.ORDERS_READ),
  async (c) => {
    try {
      const id = c.req.param("id");
      const isUUID =
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      let invoice = await db.query.invoices.findFirst({
        where: isUUID
          ? eq(invoices.id, id)
          : eq(invoices.invoiceNumber, id),
      });

      let pdfBytes: Uint8Array;

      if (invoice && invoice.pdfBase64) {
        pdfBytes = new Uint8Array(Buffer.from(invoice.pdfBase64, "base64"));
      } else if (invoice) {
        // Invoice exists but missing PDF binary; generate and update DB
        const order = await orderService.getOrderByIdOrNumber(invoice.orderId);
        if (!order) {
          return c.json({ success: false, error: "Associated order not found" }, 404);
        }
        const result = await invoiceService.generateAndSaveInvoice(order as any);
        invoice = result.invoice;
        pdfBytes = result.pdfBytes;
      } else {
        // Check if `id` is an order ID or orderNumber directly
        const order = await orderService.getOrderByIdOrNumber(id);
        if (!order) {
          return c.json({ success: false, error: "Invoice not found" }, 404);
        }
        const result = await invoiceService.generateAndSaveInvoice(order as any);
        invoice = result.invoice;
        pdfBytes = result.pdfBytes;
      }

      const invoiceNum = invoice?.invoiceNumber || `INV-${id}`;

      const headers = new Headers();
      headers.set("Content-Type", "application/pdf");
      headers.set(
        "Content-Disposition",
        `inline; filename="${invoiceNum}.pdf"`,
      );
      headers.set("Content-Length", String(pdfBytes.length));

      return new Response(pdfBytes.buffer as ArrayBuffer, {
        status: 200,
        headers,
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to stream invoice PDF",
        },
        500,
      );
    }
  },
);

// ─────────────────────────────────────────────────────────────
// POST /admin/invoices/generate/:orderId — Regenerate or Generate Invoice
// ─────────────────────────────────────────────────────────────
adminInvoicesRoute.post(
  "/invoices/generate/:orderId",
  requirePermission(Permissions.ORDERS_READ),
  async (c) => {
    try {
      const orderId = c.req.param("orderId");
      const order = await orderService.getOrderByIdOrNumber(orderId);
      if (!order) {
        return c.json({ success: false, error: "Order not found" }, 404);
      }

      const { invoice } = await invoiceService.generateAndSaveInvoice(order as any);

      return c.json({
        success: true,
        message: "Invoice successfully generated and persisted to database",
        data: {
          id: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          orderId: invoice.orderId,
          totalAmount: invoice.totalAmount,
          createdAt: invoice.createdAt,
        },
      });
    } catch (error: any) {
      return c.json(
        {
          success: false,
          error: error.message || "Failed to generate invoice",
        },
        500,
      );
    }
  },
);
