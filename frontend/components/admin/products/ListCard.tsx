"use client";

import type { ReactNode } from "react";
import { Box, Button, Group, Stack, type BoxProps } from "@mantine/core";
import { IconFilterOff } from "@tabler/icons-react";
import { SectionCard } from "../kit";
import classes from "./list-card.module.css";

export interface ListCardProps {
  title: ReactNode;
  /** Muted line under the title (e.g. the result count). */
  subtitle?: ReactNode;
  icon?: ReactNode;
  /** Header controls on the right (export, view toggle …). */
  actions?: ReactNode;
  /** Status tabs row (`CountTabs`). */
  tabs?: ReactNode;
  /** Filter controls (search, selects, date range). */
  filters?: ReactNode;
  /** Number of filters that differ from their defaults (shows "Clear filters"). */
  activeFilterCount?: number;
  onResetFilters?: () => void;
  /** The `DataTable` (or any edge-to-edge body). */
  children: ReactNode;
  id?: string;
}

/**
 * Wraps a filter field whose component only takes a visible `label` (e.g.
 * `ProductPicker`): the label stays for assistive tech, but takes no space.
 */
export function HiddenLabelField({ children, w }: { children: ReactNode; w?: BoxProps["w"] }) {
  return (
    <Box className={classes.hiddenLabel} w={w}>
      {children}
    </Box>
  );
}

/**
 * Operations list layout (mockup tables): one white card with the title row,
 * pill tabs, an inline filter bar and the table edge to edge underneath. The
 * table scrolls horizontally inside the card on narrow screens.
 *
 * Composed from the kit `SectionCard` + the shared `DataTable`; a candidate for
 * the kit once other pages need it.
 */
export function ListCard({
  title,
  subtitle,
  icon,
  actions,
  tabs,
  filters,
  activeFilterCount = 0,
  onResetFilters,
  children,
  id,
}: ListCardProps) {
  const showReset = Boolean(onResetFilters) && activeFilterCount > 0;
  return (
    <SectionCard id={id} title={title} subtitle={subtitle} icon={icon} actions={actions} flush fullHeight={false}>
      {tabs || filters ? (
        <Stack gap="sm" px={{ base: "md", sm: "lg" }} pb="md">
          {tabs}
          {filters ? (
            <Group gap="sm" align="flex-end" wrap="wrap" role="group" aria-label="Filters">
              {filters}
              {showReset ? (
                <Button
                  variant="subtle"
                  color="gray"
                  size="sm"
                  radius="xl"
                  leftSection={<IconFilterOff size={16} aria-hidden />}
                  onClick={onResetFilters}
                >
                  Clear filters ({activeFilterCount})
                </Button>
              ) : null}
            </Group>
          ) : null}
        </Stack>
      ) : null}
      <Box className={classes.embed}>{children}</Box>
    </SectionCard>
  );
}
