"use client";

import { Group, Pagination, Text } from "@mantine/core";
import type { PaginationMeta } from "../../types/api";

export interface CatalogPaginationProps {
  meta: PaginationMeta | undefined;
  page: number;
  onChange: (page: number) => void;
}

/** Server pagination driven by the response `meta` ("Showing 13–24 of 50"). */
export function CatalogPagination({ meta, page, onChange }: CatalogPaginationProps) {
  if (!meta || meta.totalPages <= 1) {
    return null;
  }

  const current = Math.min(page, meta.totalPages);
  const from = (current - 1) * meta.limit + 1;
  const to = Math.min(meta.total, current * meta.limit);

  return (
    <Group component="nav" aria-label="Pagination" justify="center" gap="md" mt={40} wrap="wrap">
      <Pagination
        total={meta.totalPages}
        value={current}
        onChange={onChange}
        siblings={1}
        boundaries={1}
        getItemProps={(itemPage) => ({ "aria-label": `Page ${itemPage}` })}
        getControlProps={(control) => {
          if (control === "previous") {
            return { "aria-label": "Previous page" };
          }
          if (control === "next") {
            return { "aria-label": "Next page" };
          }
          return {};
        }}
      />
      <Text size="xs" c="dimmed" className="mo-tabular-nums" w="100%" ta="center">
        Showing {from}–{to} of {meta.total}
      </Text>
    </Group>
  );
}
