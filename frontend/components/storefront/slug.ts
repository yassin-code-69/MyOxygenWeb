/**
 * `"mother-care"` → `"Mother Care"`. Used only where no category/product name is
 * available yet (metadata, Suspense fallbacks). Dependency-free so server components
 * can import it.
 */
export function humanizeSlug(slug: string): string {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // Malformed escape sequence: use the raw segment.
  }
  return decoded
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
