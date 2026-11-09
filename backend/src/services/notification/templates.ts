/**
 * Email and SMS templates. Every interpolated value in HTML is escaped.
 * SMS bodies stay plain ASCII ("Tk" instead of "৳") so they fit in GSM-7
 * 160-character segments instead of 70-character Unicode segments.
 */
import type {
  InventoryDigest,
  OrderNotificationContext,
  OrderNotificationTemplate,
} from "./notification.interface";

export const BRAND = {
  name: "My Oxygen",
  tagline: "Premium Mother & Baby Care Essentials",
  supportEmail: "support@myoxygen.com",
  supportPhone: "+880 1700-000000",
  website: "myoxygen.com",
  colors: { primary: "#FF6B8B", text: "#1F2937", muted: "#6B7280", canvas: "#FFF8F6", surface: "#FFFFFF" },
} as const;

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function formatTaka(amount: number): string {
  return `৳${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTk(amount: number): string {
  return `Tk ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/** Keeps SMS text GSM-friendly: drops non-ASCII characters and collapses whitespace. */
function asciiOnly(value: string): string {
  return value.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim();
}

function courierLabel(provider: string | null): string | null {
  if (!provider) return null;
  if (provider.toLowerCase() === "steadfast") return "Steadfast Courier";
  return provider;
}

interface TemplateCopy {
  subject: string;
  heading: string;
  intro: string;
}

function copyFor(template: OrderNotificationTemplate, ctx: OrderNotificationContext): TemplateCopy {
  const number = ctx.orderNumber;
  const courier = courierLabel(ctx.courierProvider);
  switch (template) {
    case "ORDER_CONFIRMED":
      return {
        subject: `Order ${number} confirmed — ${BRAND.name}`,
        heading: "Thank you for your order!",
        intro:
          ctx.paymentMethod === "COD"
            ? "We have received your order and will start preparing it shortly. Please keep the cash ready for the delivery rider."
            : "We have received your order and will start preparing it shortly.",
      };
    case "ORDER_PROCESSING":
      return {
        subject: `Order ${number} is being prepared — ${BRAND.name}`,
        heading: "Your order is being prepared",
        intro: "Good news! Our team is packing your order with care. We will let you know as soon as it ships.",
      };
    case "ORDER_SHIPPED":
      return {
        subject: `Order ${number} is on its way — ${BRAND.name}`,
        heading: "Your order has shipped",
        intro: `Your order is on its way${courier ? ` with ${courier}` : ""}.${
          ctx.trackingId ? ` Tracking ID: ${ctx.trackingId}.` : ""
        }`,
      };
    case "ORDER_DELIVERED":
      return {
        subject: `Order ${number} delivered — ${BRAND.name}`,
        heading: "Your order has been delivered",
        intro: "We hope you and your little one love it. Thank you for shopping with us!",
      };
    case "ORDER_CANCELLED":
      return {
        subject: `Order ${number} cancelled — ${BRAND.name}`,
        heading: "Your order has been cancelled",
        intro: "Your order has been cancelled. If you did not request this, please contact our support team.",
      };
    case "ORDER_REFUNDED":
      return {
        subject: `Refund issued for order ${number} — ${BRAND.name}`,
        heading: "Your refund has been issued",
        intro: `We have issued a refund of ${formatTaka(ctx.total)} for this order.`,
      };
  }
}

function itemRowsHtml(ctx: OrderNotificationContext): string {
  return ctx.items
    .map(
      (item) => `
            <tr>
              <td style="padding:10px 0;border-bottom:1px solid #F3E8EB;color:${BRAND.colors.text};font-size:14px;">${escapeHtml(item.title)}</td>
              <td align="center" style="padding:10px 0;border-bottom:1px solid #F3E8EB;color:${BRAND.colors.muted};font-size:14px;">${item.quantity}</td>
              <td align="right" style="padding:10px 0;border-bottom:1px solid #F3E8EB;color:${BRAND.colors.text};font-size:14px;">${escapeHtml(formatTaka(item.totalPrice))}</td>
            </tr>`,
    )
    .join("");
}

function summaryRowHtml(label: string, value: string, emphasis = false): string {
  const weight = emphasis ? "700" : "400";
  const color = emphasis ? BRAND.colors.primary : BRAND.colors.text;
  return `
            <tr>
              <td style="padding:4px 0;font-size:14px;color:${BRAND.colors.muted};font-weight:${weight};">${escapeHtml(label)}</td>
              <td align="right" style="padding:4px 0;font-size:14px;color:${color};font-weight:${weight};">${escapeHtml(value)}</td>
            </tr>`;
}

export function renderOrderEmail(
  template: OrderNotificationTemplate,
  ctx: OrderNotificationContext,
): RenderedEmail {
  const copy = copyFor(template, ctx);
  const address = [
    ctx.shippingAddress.addressLine1,
    ctx.shippingAddress.addressLine2,
    ctx.shippingAddress.city,
    ctx.shippingAddress.district,
    ctx.shippingAddress.postalCode,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(", ");

  const summaryRows = [
    summaryRowHtml("Subtotal", formatTaka(ctx.subtotal)),
    summaryRowHtml("Delivery fee", ctx.deliveryFee === 0 ? "FREE" : formatTaka(ctx.deliveryFee)),
    ctx.discountAmount > 0 ? summaryRowHtml("Coupon discount", `-${formatTaka(ctx.discountAmount)}`) : "",
    summaryRowHtml("Total", formatTaka(ctx.total), true),
  ].join("");

  const cta = ctx.orderUrl
    ? `
          <tr>
            <td align="center" style="padding:8px 32px 24px;">
              <a href="${escapeHtml(ctx.orderUrl)}" style="background:${BRAND.colors.primary};color:#FFFFFF;text-decoration:none;padding:12px 28px;border-radius:9999px;font-size:14px;font-weight:600;display:inline-block;">View your order</a>
            </td>
          </tr>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(copy.subject)}</title>
</head>
<body style="margin:0;padding:24px;background:${BRAND.colors.canvas};font-family:Inter,'Open Sans',Arial,sans-serif;color:${BRAND.colors.text};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:${BRAND.colors.surface};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="background:${BRAND.colors.primary};padding:28px 32px;text-align:center;color:#FFFFFF;">
              <div style="font-family:Poppins,Montserrat,Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:0.5px;">${escapeHtml(BRAND.name.toUpperCase())}</div>
              <div style="font-size:13px;margin-top:6px;">${escapeHtml(BRAND.tagline)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 32px 8px;">
              <h1 style="margin:0 0 12px;font-family:Poppins,Montserrat,Arial,sans-serif;font-size:20px;color:${BRAND.colors.text};">${escapeHtml(copy.heading)}</h1>
              <p style="margin:0 0 8px;font-size:15px;line-height:1.5;">Dear ${escapeHtml(ctx.customerName)},</p>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:${BRAND.colors.muted};">${escapeHtml(copy.intro)}</p>
              <p style="margin:0 0 16px;font-size:14px;">Order <strong>${escapeHtml(ctx.orderNumber)}</strong></p>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <th align="left" style="padding:6px 0;font-size:12px;text-transform:uppercase;color:${BRAND.colors.primary};border-bottom:2px solid ${BRAND.colors.primary};">Item</th>
                  <th align="center" style="padding:6px 0;font-size:12px;text-transform:uppercase;color:${BRAND.colors.primary};border-bottom:2px solid ${BRAND.colors.primary};">Qty</th>
                  <th align="right" style="padding:6px 0;font-size:12px;text-transform:uppercase;color:${BRAND.colors.primary};border-bottom:2px solid ${BRAND.colors.primary};">Total</th>
                </tr>${itemRowsHtml(ctx)}
              </table>
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin-top:16px;">${summaryRows}
              </table>
              <p style="margin:16px 0 0;font-size:13px;color:${BRAND.colors.muted};">Delivery address: ${escapeHtml(`${ctx.shippingAddress.fullName}, ${address}`)}</p>
            </td>
          </tr>${cta}
          <tr>
            <td style="padding:16px 32px;background:${BRAND.colors.canvas};text-align:center;font-size:12px;color:${BRAND.colors.muted};">
              Questions? ${escapeHtml(BRAND.supportEmail)} · ${escapeHtml(BRAND.supportPhone)}<br>${escapeHtml(BRAND.website)}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    copy.heading,
    "",
    `Dear ${ctx.customerName},`,
    copy.intro,
    "",
    `Order ${ctx.orderNumber}`,
    ...ctx.items.map((item) => `- ${item.title} x${item.quantity}: ${formatTaka(item.totalPrice)}`),
    "",
    `Subtotal: ${formatTaka(ctx.subtotal)}`,
    `Delivery fee: ${ctx.deliveryFee === 0 ? "FREE" : formatTaka(ctx.deliveryFee)}`,
    ...(ctx.discountAmount > 0 ? [`Coupon discount: -${formatTaka(ctx.discountAmount)}`] : []),
    `Total: ${formatTaka(ctx.total)}`,
    ...(ctx.orderUrl ? ["", `View your order: ${ctx.orderUrl}`] : []),
    "",
    `Questions? ${BRAND.supportEmail} / ${BRAND.supportPhone}`,
  ];

  return { subject: copy.subject, html, text: textLines.join("\n") };
}

/** SMS body for templates that use the SMS channel. */
export function renderOrderSms(template: OrderNotificationTemplate, ctx: OrderNotificationContext): string {
  const number = ctx.orderNumber;
  const link = ctx.orderUrl ? ` Details: ${ctx.orderUrl}` : "";
  const courier = courierLabel(ctx.courierProvider);
  let text: string;
  switch (template) {
    case "ORDER_CONFIRMED":
      text = `${BRAND.name}: Order ${number} confirmed. Total ${formatTk(ctx.total)}${
        ctx.paymentMethod === "COD" ? " (cash on delivery)" : ""
      }.${link}`;
      break;
    case "ORDER_PROCESSING":
      text = `${BRAND.name}: Order ${number} is being prepared.${link}`;
      break;
    case "ORDER_SHIPPED":
      text = `${BRAND.name}: Order ${number} has shipped${courier ? ` via ${courier}` : ""}.${
        ctx.trackingId ? ` Tracking ID: ${ctx.trackingId}.` : ""
      }${link}`;
      break;
    case "ORDER_DELIVERED":
      text = `${BRAND.name}: Order ${number} has been delivered. Thank you for shopping with us!`;
      break;
    case "ORDER_CANCELLED":
      text = `${BRAND.name}: Order ${number} has been cancelled. Questions? Call ${BRAND.supportPhone}.`;
      break;
    case "ORDER_REFUNDED":
      text = `${BRAND.name}: A refund of ${formatTk(ctx.total)} was issued for order ${number}.`;
      break;
  }
  return asciiOnly(text);
}

export function renderInventoryDigestEmail(digest: InventoryDigest): RenderedEmail {
  const subject = `${BRAND.name} inventory digest ${digest.generatedFor}: ${digest.lowStock.length} low stock, ${digest.expiringSoon.length} expiring`;
  const cell = (value: string, align: "left" | "right" = "left") =>
    `<td align="${align}" style="padding:6px 8px;border-bottom:1px solid #F3E8EB;font-size:13px;">${escapeHtml(value)}</td>`;
  const head = (labels: string[]) =>
    `<tr>${labels
      .map(
        (label) =>
          `<th align="left" style="padding:6px 8px;font-size:12px;text-transform:uppercase;color:${BRAND.colors.primary};border-bottom:2px solid ${BRAND.colors.primary};">${escapeHtml(label)}</th>`,
      )
      .join("")}</tr>`;

  const lowStockTable =
    digest.lowStock.length === 0
      ? `<p style="font-size:14px;color:${BRAND.colors.muted};">No products are at or below their low-stock threshold.</p>`
      : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${head([
          "Product",
          "SKU",
          "In stock",
          "Threshold",
        ])}${digest.lowStock
          .map(
            (item) =>
              `<tr>${cell(item.title)}${cell(item.sku)}${cell(String(item.availableStock), "right")}${cell(String(item.lowStockThreshold), "right")}</tr>`,
          )
          .join("")}</table>`;

  const expiringTable =
    digest.expiringSoon.length === 0
      ? `<p style="font-size:14px;color:${BRAND.colors.muted};">No batches expire within the next 30 days.</p>`
      : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">${head([
          "Product",
          "Batch",
          "Expires",
          "Days left",
          "Units",
        ])}${digest.expiringSoon
          .map(
            (batch) =>
              `<tr>${cell(batch.productTitle)}${cell(batch.batchNumber)}${cell(batch.expiryDate)}${cell(String(batch.daysUntilExpiry), "right")}${cell(String(batch.availableQuantity), "right")}</tr>`,
          )
          .join("")}</table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:${BRAND.colors.canvas};font-family:Inter,'Open Sans',Arial,sans-serif;color:${BRAND.colors.text};">
  <div style="max-width:720px;margin:0 auto;background:${BRAND.colors.surface};border-radius:16px;padding:24px 28px;">
    <h1 style="margin:0 0 4px;font-family:Poppins,Montserrat,Arial,sans-serif;font-size:20px;">Daily inventory digest</h1>
    <p style="margin:0 0 20px;font-size:13px;color:${BRAND.colors.muted};">${escapeHtml(digest.generatedFor)}</p>
    <h2 style="font-size:16px;margin:0 0 8px;">Low stock (${digest.lowStock.length})</h2>
    ${lowStockTable}
    <h2 style="font-size:16px;margin:24px 0 8px;">Batches expiring within 30 days (${digest.expiringSoon.length})</h2>
    ${expiringTable}
  </div>
</body>
</html>`;

  const text = [
    `Daily inventory digest ${digest.generatedFor}`,
    "",
    `Low stock (${digest.lowStock.length}):`,
    ...digest.lowStock.map(
      (item) => `- ${item.title} (${item.sku}): ${item.availableStock} left, threshold ${item.lowStockThreshold}`,
    ),
    "",
    `Batches expiring within 30 days (${digest.expiringSoon.length}):`,
    ...digest.expiringSoon.map(
      (batch) =>
        `- ${batch.productTitle} batch ${batch.batchNumber}: expires ${batch.expiryDate} (${batch.daysUntilExpiry} days), ${batch.availableQuantity} units`,
    ),
  ].join("\n");

  return { subject, html, text };
}
