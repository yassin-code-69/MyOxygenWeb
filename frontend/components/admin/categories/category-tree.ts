import type { AdminCategory } from "../../../types/admin-management";

export interface CategoryRow extends AdminCategory {
  /** 0 for top-level categories. */
  depth: number;
  parentName: string | null;
}

/**
 * Orders categories as a tree (each parent followed by its children, both in
 * storefront order — the API already sorts by `sortOrder`, then name).
 * Categories whose parent is missing are treated as top-level.
 */
export function toCategoryRows(categories: readonly AdminCategory[]): CategoryRow[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const children = new Map<string | null, AdminCategory[]>();
  for (const category of categories) {
    const parentKey = category.parentId && byId.has(category.parentId) ? category.parentId : null;
    const siblings = children.get(parentKey) ?? [];
    siblings.push(category);
    children.set(parentKey, siblings);
  }

  const rows: CategoryRow[] = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    for (const category of children.get(parentId) ?? []) {
      if (visited.has(category.id)) {
        continue;
      }
      visited.add(category.id);
      const parent = category.parentId ? byId.get(category.parentId) : undefined;
      rows.push({ ...category, depth, parentName: parent?.name ?? null });
      walk(category.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything unreachable (a cycle the API should never allow) is still listed.
  for (const category of categories) {
    if (!visited.has(category.id)) {
      rows.push({ ...category, depth: 0, parentName: byId.get(category.parentId ?? "")?.name ?? null });
    }
  }
  return rows;
}

/** Ids of `id` and every category below it (a category can't move under itself or a descendant). */
export function descendantIds(categories: readonly AdminCategory[], id: string): Set<string> {
  const result = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const category of categories) {
      if (category.parentId && result.has(category.parentId) && !result.has(category.id)) {
        result.add(category.id);
        grew = true;
      }
    }
  }
  return result;
}

/** Mirrors the backend `slugify` (product.service.ts): lower-case latin letters and digits joined by single hyphens. */
export function slugify(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    .replace(/-+$/g, "");
}
