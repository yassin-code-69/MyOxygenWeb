"use client";

import type { ReactNode } from "react";
import { Button, Group, Paper } from "@mantine/core";
import { IconFilterOff } from "@tabler/icons-react";

export interface FilterBarProps {
  children: ReactNode;
  /** Number of filters that differ from their defaults. */
  activeCount?: number;
  onReset?: () => void;
  /** Extra right-aligned content (e.g. an export button). */
  actions?: ReactNode;
}

/** One row of filters above a table, wrapping on small screens. */
export function FilterBar({ children, activeCount = 0, onReset, actions }: FilterBarProps) {
  return (
    <Paper withBorder radius="md" p="sm" mb="md">
      <Group gap="sm" align="flex-end" wrap="wrap" justify="space-between">
        <Group gap="sm" align="flex-end" wrap="wrap" style={{ flex: "1 1 520px" }}>
          {children}
        </Group>
        <Group gap="xs" wrap="wrap">
          {onReset && activeCount > 0 ? (
            <Button
              variant="subtle"
              color="gray"
              size="sm"
              leftSection={<IconFilterOff size={16} aria-hidden />}
              onClick={onReset}
            >
              Clear filters ({activeCount})
            </Button>
          ) : null}
          {actions}
        </Group>
      </Group>
    </Paper>
  );
}
