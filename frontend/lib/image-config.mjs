/**
 * Remote image hosts — shared by `next.config.mjs` (images.remotePatterns) and
 * `components/ImageWithFallback.tsx` (decides whether next/image may optimize a URL).
 * Plain ESM so the Next config can import it without a TS loader.
 */

/** @type {ReadonlyArray<{ protocol: "https"; hostname: string; pathname: string }>} */
export const REMOTE_IMAGE_PATTERNS = [
  // Product photography used by the seed data and static catalog.
  { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
  // Admin placeholder thumbnails.
  { protocol: "https", hostname: "placehold.co", pathname: "/**" },
  // Supabase Storage public buckets (product uploads).
  { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
];

/** Brand placeholder shown when a product has no image or it fails to load. */
export const PLACEHOLDER_IMAGE = "/images/placeholder-product.svg";
