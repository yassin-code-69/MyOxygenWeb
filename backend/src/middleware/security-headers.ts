import { secureHeaders } from "hono/secure-headers";

/**
 * Security headers for a JSON API (no HTML is ever served):
 * - CSP `default-src 'none'; frame-ancestors 'none'` — nothing may load or frame responses.
 * - X-Frame-Options DENY, nosniff, no-referrer leakage, HSTS (ignored over plain HTTP).
 * - Cross-Origin-Resource-Policy is `cross-origin` so the storefront on another
 *   origin can still fetch (CORS remains the access control).
 */
export const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'none'"],
    frameAncestors: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'none'"],
  },
  crossOriginResourcePolicy: "cross-origin",
  crossOriginOpenerPolicy: "same-origin",
  referrerPolicy: "strict-origin-when-cross-origin",
  strictTransportSecurity: "max-age=31536000; includeSubDomains",
  xFrameOptions: "DENY",
  xContentTypeOptions: true,
  xXssProtection: "0",
  removePoweredBy: true,
});
