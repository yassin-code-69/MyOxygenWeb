"use client";

import Link from "next/link";
import { Box, Button, Center, Group, Paper, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconLock, IconLogin } from "@tabler/icons-react";

/** Placeholder for page content (header + cards + table) while a page chunk loads. */
export function AdminPageSkeleton() {
  return (
    <Stack gap="lg" aria-busy aria-label="Loading">
      <Stack gap={8}>
        <Skeleton height={30} width={240} radius="md" />
        <Skeleton height={14} width={360} radius="xl" />
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={128} radius="md" />
        ))}
      </SimpleGrid>
      <Skeleton height={56} radius="md" />
      <Skeleton height={360} radius="md" />
    </Stack>
  );
}

/** Full-screen placeholder while the persisted session is restored. */
export function AdminBootSkeleton() {
  return (
    <Box mih="100dvh" bg="var(--mo-color-canvas)" aria-busy aria-label="Loading the back-office">
      <Group h={64} px="md" justify="space-between" bg="var(--mo-color-surface)" style={{ borderBottom: "1px solid var(--mo-color-border-subtle)" }}>
        <Group gap="sm">
          <Skeleton height={38} width={38} radius="md" />
          <Skeleton height={16} width={140} radius="xl" />
        </Group>
        <Group gap="sm">
          <Skeleton height={34} width={34} circle />
          <Skeleton height={34} width={120} radius="xl" visibleFrom="sm" />
        </Group>
      </Group>
      <Group align="flex-start" gap={0} wrap="nowrap">
        <Stack w={260} p="md" gap="xs" visibleFrom="md" mih="calc(100dvh - 64px)" bg="var(--mo-color-surface)" style={{ borderRight: "1px solid var(--mo-color-border-subtle)" }}>
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} height={44} radius="md" />
          ))}
        </Stack>
        <Box p="md" style={{ flex: 1, minWidth: 0 }}>
          <AdminPageSkeleton />
        </Box>
      </Group>
    </Box>
  );
}

export interface AdminCustomerBlockedProps {
  fullName: string;
  onSwitchAccount: () => void;
}

/** 403 screen for signed-in customers who open `/admin`. */
export function AdminCustomerBlocked({ fullName, onSwitchAccount }: AdminCustomerBlockedProps) {
  return (
    <Center mih="100dvh" p="md" bg="var(--mo-color-canvas)">
      <Paper withBorder radius="md" p="xl" maw={480} w="100%" shadow="card" role="alert">
        <Stack align="center" ta="center" gap="sm">
          <ThemeIcon size={60} radius="xl" variant="light" color="primaryPink">
            <IconLock size={30} aria-hidden />
          </ThemeIcon>
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={{ letterSpacing: "0.08em" }}>
            Error 403
          </Text>
          <Title order={1} fz={24}>
            This area is for My Oxygen staff
          </Title>
          <Text c="dimmed" size="sm">
            You&apos;re signed in as {fullName} with a customer account, which can&apos;t open the store back-office.
          </Text>
          <Group justify="center" gap="sm" mt="sm">
            <Button component={Link} href="/" leftSection={<IconArrowLeft size={16} aria-hidden />}>
              Back to the store
            </Button>
            <Button variant="default" leftSection={<IconLogin size={16} aria-hidden />} onClick={onSwitchAccount}>
              Sign in as staff
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Center>
  );
}
