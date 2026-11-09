"use client";

import { Button, Group, Paper, Stack, Text } from "@mantine/core";
import { IconBolt, IconShieldLock } from "@tabler/icons-react";
import { brand, semantic } from "../../tokens";
import type { LoginPayload } from "../../types/auth";

/**
 * Seeded super-admin credentials for the one-click dev login (SPECIFICATION §5).
 * The literals live inside the `NODE_ENV === "development"` branch, which the
 * production build replaces with `false` and removes, so they never ship.
 */
function devAdminCredentials(): LoginPayload | null {
  if (process.env.NODE_ENV === "development") {
    return { identifier: "admin@myoxygen.com", password: "Admin@MyOxygen2026" };
  }
  return null;
}

export interface DevAdminLoginProps {
  onLogin: (credentials: LoginPayload) => void;
  loading: boolean;
  disabled?: boolean;
}

/** Development-only shortcut: sign in as the seeded super admin. Renders nothing elsewhere. */
export function DevAdminLogin({ onLogin, loading, disabled = false }: DevAdminLoginProps) {
  const credentials = devAdminCredentials();
  if (!credentials) {
    return null;
  }

  return (
    <Paper
      radius="md"
      p="sm"
      mb="lg"
      style={{ backgroundColor: semantic.surfaceBrandTint, border: `1px dashed ${brand.primary}` }}
    >
      <Group justify="space-between" wrap="nowrap" gap="sm">
        <Stack gap={0}>
          <Group gap={6} wrap="nowrap">
            <IconBolt size={14} color={brand.primary} aria-hidden />
            <Text size="xs" fw={700} c={semantic.textBrand}>
              Development shortcut
            </Text>
          </Group>
          <Text size="xs" c={semantic.textMutedOnTint}>
            Sign in as the seeded super admin
          </Text>
        </Stack>
        <Button
          size="xs"
          radius="xl"
          color="primaryPink"
          loading={loading}
          disabled={disabled}
          leftSection={<IconShieldLock size={14} aria-hidden />}
          onClick={() => onLogin(credentials)}
        >
          Login as Admin
        </Button>
      </Group>
    </Paper>
  );
}
