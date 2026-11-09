import { REMOTE_IMAGE_PATTERNS } from "./lib/image-config.mjs";

const isDev = process.env.NODE_ENV !== "production";

/** Origin of the API the browser talks to (inlined at build time, like NEXT_PUBLIC_API_URL itself). */
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").origin;
  } catch {
    return "http://localhost:4000";
  }
})();

/**
 * Content Security Policy.
 * - Scripts/styles allow 'unsafe-inline' because Next's bootstrap and Mantine's
 *   color-scheme script are inline (a nonce setup would need middleware).
 * - Images may come from any https host: admins can attach product images by URL.
 * - object-src allows blob: so authenticated PDF invoices opened via api.open() render.
 * - Dev adds 'unsafe-eval' and ws: for React Refresh / HMR.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isDev ? " ws: wss:" : ""}`,
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Ignored by browsers over plain http (local dev); enforced once served over https.
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    formats: ["image/avif", "image/webp"],
    // Shared with components/ImageWithFallback (unknown hosts render unoptimized instead of crashing).
    remotePatterns: REMOTE_IMAGE_PATTERNS.map((pattern) => ({ ...pattern })),
    minimumCacheTTL: 60 * 60 * 24,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    optimizePackageImports: [
      "@mantine/core",
      "@mantine/hooks",
      "@mantine/dates",
      "@mantine/carousel",
      "@mantine/notifications",
      "@mantine/form",
      "@tabler/icons-react",
    ],
  },
};

export default nextConfig;
