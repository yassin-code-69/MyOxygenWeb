import type { AdminBrand } from "../../../types/admin-management";

/** Comparison key for near-duplicates: "L'Oréal", "loreal" and "L Oreal" share one key. */
export function brandKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ঀ-৿]+/g, "");
}

/** Brand name → the other spellings that look like the same brand. */
export function findSimilarBrands(brands: readonly AdminBrand[]): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const brand of brands) {
    const key = brandKey(brand.name);
    if (key === "") {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), brand.name]);
  }
  const result = new Map<string, string[]>();
  for (const names of groups.values()) {
    if (names.length < 2) {
      continue;
    }
    for (const name of names) {
      result.set(
        name,
        names.filter((other) => other !== name),
      );
    }
  }
  return result;
}

/** Spellings the API renames together with `from` (it matches case-insensitively). */
export function caseVariants(brands: readonly AdminBrand[], from: string): AdminBrand[] {
  const lower = from.toLowerCase();
  return brands.filter((brand) => brand.name !== from && brand.name.toLowerCase() === lower);
}
