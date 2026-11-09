"use client";

import Link from "next/link";
import { Box, Button, Center, Group, Paper, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconLock, IconLogin } from "@tabler/icons-react";

/** Placeholder for page content (title row + KPI tiles + two cards) while a page chunk loads. */
export function AdminPageSkeleton() {
  return (
    <Stack gap="lg" aria-busy aria-label="Loading">
      <Stack gap={8}>
        <Skeleton height={28} width={260} radius="md" />
        <Skeleton height={14} width={340} radius="xl" />
      </Stack>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} height={132} radius="md" />
        ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, lg: 2 }} spacing="md">
        <Skeleton height={340} radius="md" />
        <Skeleton height={340} radius="md" />
      </SimpleGrid>
    </Stack>
  );
}

/** Full-screen placeholder (same frame as the shell) while the persisted session is restored. */
export function AdminBootSkeleton() {
  return (
    <Box mih="100dvh" bg="var(--mo-color-surface-muted)" aria-busy aria-label="Loading the back-office">
      <Group align="stretch" gap={0} wrap="nowrap" mih="100dvh">
        <Stack
          w={260}
          gap={0}
          visibleFrom="md"
          bg="var(--mo-color-surface)"
          style={{ borderRight: "1px solid var(--mo-color-border)", flex: "0 0 260px" }}
        >
          <Group h={72} px={20} gap="sm" wrap="nowrap">
            <Skeleton height={40} width={40} circle />
            <Stack gap={6}>
              <Skeleton height={14} width={110} radius="xl" />
              <Skeleton height={8} width={90} radius="xl" />
            </Stack>
          </Group>
          <Stack gap={6} px={12} pt={4}>
            {Array.from({ length: 9 }, (_, index) => (
              <Skeleton key={index} height={40} radius="md" />
            ))}
          </Stack>
        </Stack>
        <Box style={{ flex: 1, minWidth: 0 }}>
          <Group
            h={72}
            px={{ base: "sm", sm: "lg" }}
            justify="space-between"
            wrap="nowrap"
            bg="var(--mo-color-surface)"
            style={{ borderBottom: "1px solid var(--mo-color-border)" }}
          >
            <Skeleton height={44} radius="xl" maw={520} style={{ flex: 1 }} />
            <Group gap="sm" wrap="nowrap">
              <Skeleton height={38} width={38} circle />
              <Skeleton height={38} width={38} circle />
              <Skeleton height={14} width={110} radius="xl" visibleFrom="sm" />
            </Group>
          </Group>
          <Box p={{ base: "md", sm: "lg" }}>
            <AdminPageSkeleton />
          </Box>
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
            {`You're signed in as ${fullName} with a customer account, which can't open the store back-office.`}
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
