/**
 * Back-office invoice endpoints (mounted at /admin). Authentication is applied
 * per route so it never runs for other /admin sub-apps.
 */
import { Hono } from "hono";
import { ok, paginated } from "../lib/http";
import { hasPermission, Permissions } from "../lib/rbac";
import { uuidParams, validate } from "../lib/validation";
import { requireAuth, requirePermission, type AuthContext } from "../middleware/auth";
import { invoiceService, pdfDownload } from "../services/invoice/invoice.service";
import { invoiceListQuerySchema, invoiceRefParam } from "./admin.schema";

export const adminInvoicesRoute = new Hono<AuthContext>();

// GET /admin/invoices — paginated invoice list
adminInvoicesRoute.get(
  "/invoices",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("query", invoiceListQuerySchema),
  async (c) => {
    const query = c.req.valid("query");
    const { items, total } = await invoiceService.listInvoices(query);
    return paginated(c, items, { page: query.page, limit: query.limit, total });
  },
);

// GET /admin/invoices/summary — totals across all invoices
adminInvoicesRoute.get("/invoices/summary", requireAuth, requirePermission(Permissions.ORDERS_READ), async (c) => {
  return ok(c, await invoiceService.getSummary());
});

// POST /admin/invoices/generate/:orderId — (re)generate an order's invoice
adminInvoicesRoute.post(
  "/invoices/generate/:orderId",
  requireAuth,
  requirePermission(Permissions.INVOICE_GENERATE),
  validate("param", uuidParams("orderId")),
  async (c) => {
    const { orderId } = c.req.valid("param");
    const { invoice } = await invoiceService.generateForOrder(orderId);
    return ok(c, await invoiceService.getInvoiceDetail(invoice.id));
  },
);

// GET /admin/invoices/:id/pdf — stored PDF; generated only for INVOICE_GENERATE holders
adminInvoicesRoute.get(
  "/invoices/:id/pdf",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("param", invoiceRefParam),
  async (c) => {
    const { id } = c.req.valid("param");
    const canGenerate = hasPermission(c.get("user").role, Permissions.INVOICE_GENERATE);
    const file = await invoiceService.getInvoicePdf(id, canGenerate);
    const download = pdfDownload(file, `${file.invoiceNumber}.pdf`);
    return c.body(download.body, 200, download.headers);
  },
);

// GET /admin/invoices/:id — invoice detail (id or invoice number)
adminInvoicesRoute.get(
  "/invoices/:id",
  requireAuth,
  requirePermission(Permissions.ORDERS_READ),
  validate("param", invoiceRefParam),
  async (c) => {
    const { id } = c.req.valid("param");
    return ok(c, await invoiceService.getInvoiceDetail(id));
  },
);
