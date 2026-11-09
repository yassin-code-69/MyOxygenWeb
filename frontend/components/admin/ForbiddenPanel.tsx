"use client";

import Link from "next/link";
import { Button, Group, Paper, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconLock } from "@tabler/icons-react";
import { getAdminHomeHref } from "../../lib/admin-nav";
import { useAuthStore } from "../../lib/auth-store";
import type { Permission } from "../../types/auth";
import { roleLabel } from "./format";
import { PERMISSION_LABELS } from "./permission-labels";

export interface ForbiddenPanelProps {
  /** The permission the page or action needs. */
  permission?: Permission;
  title?: string;
  /** Override the explanation (e.g. the API's 403 message). */
  message?: string;
  /** Compact variant for use inside tables, drawers and cards. */
  compact?: boolean;
}

/**
 * Friendly 403 panel: explains which permission is missing and links to a
 * page the user can open instead.
 */
export function ForbiddenPanel({ permission, title, message, compact = false }: ForbiddenPanelProps) {
  const role = useAuthStore((state) => state.user?.role ?? null);
  const homeHref = getAdminHomeHref(role);
  const explanation =
    message ??
    (permission
      ? `Your role${role ? ` (${roleLabel(role)})` : ""} can't ${PERMISSION_LABELS[permission]}. Ask the store owner if you need access.`
      : "Your account doesn't have access to this page. Ask the store owner if you need access.");

  return (
    <Paper withBorder radius="md" p={compact ? "md" : "xl"} role="alert">
      <Stack align="center" gap="sm" ta="center" py={compact ? 0 : "lg"}>
        <ThemeIcon size={compact ? 40 : 56} radius="xl" variant="light" color="warning">
          <IconLock size={compact ? 20 : 28} aria-hidden />
        </ThemeIcon>
        <Title order={compact ? 4 : 3}>{title ?? "You don't have access to this"}</Title>
        <Text c="dimmed" size="sm" maw={460}>
          {explanation}
        </Text>
        {!compact ? (
          <Group gap="sm" justify="center" mt="xs">
            {homeHref ? (
              <Button component={Link} href={homeHref} variant="light" leftSection={<IconArrowLeft size={16} aria-hidden />}>
                Go to my workspace
              </Button>
            ) : null}
            <Button component={Link} href="/" variant="subtle" color="gray">
              Back to the store
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Paper>
  );
}
