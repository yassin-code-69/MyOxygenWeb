"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box, Group, Loader, Text } from "@mantine/core";
import { Spotlight, createSpotlight } from "@mantine/spotlight";
import { IconArrowRight, IconSearch, IconUser } from "@tabler/icons-react";
import { useAdminSearch } from "../../hooks/admin/use-admin-search";
import type { AdminNavItem } from "../../lib/admin-nav";
import { getErrorMessage, isApiError } from "../../lib/api-client";
import { ADMIN_SEARCH_MIN_LENGTH } from "../../types/admin-dashboard";
import { StatusBadge } from "../StatusBadge";
import { startPageProgress } from "../PageProgressBar";
import { formatMoney } from "./format";
import { Thumb } from "./kit/ThumbCell";
import classes from "./AdminShell.module.css";

/** Dedicated spotlight store for the back-office command palette. */
export const [adminSpotlightStore, adminSpotlight] = createSpotlight();

export interface AdminCommandPaletteProps {
  /** Pages the user may open (`getAdminNavItems(role)`), offered as "Go to …" actions. */
  navItems: readonly AdminNavItem[];
}

function matches(item: AdminNavItem, query: string): boolean {
  if (!query) {
    return true;
  }
  const haystack = `${item.label} ${item.groupLabel ?? ""} ${item.description}`.toLowerCase();
  return query.split(/\s+/).every((word) => haystack.includes(word));
}

/**
 * Ctrl/⌘ + K command palette: live search across products, orders and
 * customers (`GET /admin/search`, debounced 250 ms) plus "Go to …" actions
 * for every page the user can open. Arrow keys move, Enter opens.
 */
export function AdminCommandPalette({ navItems }: AdminCommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const search = useAdminSearch(query);
  const trimmed = query.trim().toLowerCase();
  const results = search.ready ? search.data : undefined;

  const pages = useMemo(() => navItems.filter((item) => matches(item, trimmed)).slice(0, trimmed ? 6 : navItems.length), [navItems, trimmed]);

  const go = (href: string) => {
    startPageProgress();
    router.push(href);
  };

  const showSearchGroups = query.trim().length >= ADMIN_SEARCH_MIN_LENGTH;
  const searchFailed = showSearchGroups && Boolean(search.error) && !results;
  const resultCount = showSearchGroups && results ? results.products.length + results.orders.length + results.customers.length : 0;
  const hasAnyAction = resultCount > 0 || pages.length > 0;

  return (
    <Spotlight.Root
      store={adminSpotlightStore}
      query={query}
      onQueryChange={setQuery}
      shortcut={["mod + K"]}
      scrollable
      maxHeight={460}
      radius="md"
      size={640}
      yOffset="10vh"
      classNames={{ action: classes.paletteAction }}
    >
      <Spotlight.Search
        placeholder="Search products, orders, customers…"
        aria-label="Search the back-office"
        leftSection={<IconSearch size={20} stroke={1.7} aria-hidden />}
        rightSection={search.pending ? <Loader size={16} color="secondaryGreen" aria-label="Searching" /> : null}
      />
      <Spotlight.ActionsList>
        {showSearchGroups && results && results.products.length > 0 ? (
          <Spotlight.ActionsGroup label="Products">
            {results.products.map((product) => (
              <Spotlight.Action
                key={`p-${product.id}`}
                onClick={() => go(product.href)}
                leftSection={<Thumb src={product.image} size={32} />}
                label={product.title}
                description={product.sku}
                highlightQuery
                highlightColor="secondaryGreen.1"
              />
            ))}
          </Spotlight.ActionsGroup>
        ) : null}

        {showSearchGroups && results && results.orders.length > 0 ? (
          <Spotlight.ActionsGroup label="Orders">
            {results.orders.map((order) => (
              <Spotlight.Action key={`o-${order.id}`} onClick={() => go(order.href)}>
                <Group justify="space-between" wrap="nowrap" gap="sm" w="100%">
                  <Box style={{ minWidth: 0 }}>
                    <Text size="sm" fw={600} ff="var(--mo-font-monospace)" truncate>
                      {order.orderNumber}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {order.customerName} · {formatMoney(order.total)}
                    </Text>
                  </Box>
                  <StatusBadge status={order.status} size="xs" withIcon={false} />
                </Group>
              </Spotlight.Action>
            ))}
          </Spotlight.ActionsGroup>
        ) : null}

        {showSearchGroups && results && results.customers.length > 0 ? (
          <Spotlight.ActionsGroup label="Customers">
            {results.customers.map((customer) => (
              <Spotlight.Action
                key={`c-${customer.id}`}
                onClick={() => go(customer.href)}
                leftSection={<IconUser size={18} aria-hidden />}
                label={customer.fullName}
                description={[customer.phone, customer.email].filter(Boolean).join(" · ")}
                highlightQuery
                highlightColor="secondaryGreen.1"
              />
            ))}
          </Spotlight.ActionsGroup>
        ) : null}

        {pages.length > 0 ? (
          <Spotlight.ActionsGroup label={trimmed ? "Pages" : "Go to"}>
            {pages.map((item) => {
              const ItemIcon = item.icon;
              return (
                <Spotlight.Action
                  key={`nav-${item.key}`}
                  onClick={() => go(item.href)}
                  leftSection={<ItemIcon size={18} stroke={1.8} aria-hidden />}
                  rightSection={<IconArrowRight size={14} aria-hidden />}
                  label={`Go to ${item.label}`}
                  description={item.groupLabel ? `${item.groupLabel} · ${item.description}` : item.description}
                />
              );
            })}
          </Spotlight.ActionsGroup>
        ) : null}

        {!hasAnyAction ? (
          <div className={classes.paletteEmpty} role="status">
            {searchFailed
              ? isApiError(search.error) && search.error.status === 404
                ? "Search isn't available yet."
                : getErrorMessage(search.error, "Search failed. Try again.")
              : search.pending
                ? "Searching…"
                : "Nothing found. Try an order number, product name, SKU or phone number."}
          </div>
        ) : null}
      </Spotlight.ActionsList>
      <Spotlight.Footer>
        <Text size="xs" c="dimmed">
          {searchFailed
            ? "Product, order and customer search is unavailable right now — showing pages only."
            : query.trim().length > 0 && query.trim().length < ADMIN_SEARCH_MIN_LENGTH
              ? `Type at least ${ADMIN_SEARCH_MIN_LENGTH} characters to search products, orders and customers.`
              : "↑ ↓ to move · Enter to open · Esc to close"}
        </Text>
      </Spotlight.Footer>
    </Spotlight.Root>
  );
}
