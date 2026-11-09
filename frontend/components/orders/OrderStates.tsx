"use client";

import Link from "next/link";
import { Button, Container, Grid, Group, Paper, Skeleton, Stack } from "@mantine/core";
import { IconLock, IconReceiptOff, IconRefresh, IconWifiOff } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { EmptyState } from "../EmptyState";
import { getErrorMessage, type ApiError } from "../../lib/api-client";
import { semantic } from "../../tokens";

export interface OrderErrorStateProps {
  error: ApiError | null;
  /** `true` when the reference itself is malformed (never sent to the API). */
  invalidReference?: boolean;
  onRetry?: () => void;
}

/** 404 / 403 / generic failure states for a single order. */
export function OrderErrorState({ error, invalidReference = false, onRetry }: OrderErrorStateProps) {
  if (invalidReference || error?.status === 404 || error?.status === 422) {
    return (
      <EmptyState
        titleOrder={2}
        icon={<IconReceiptOff stroke={1.6} />}
        title="We couldn't find that order"
        description="Check the order number, or find it in your order history."
        action={
          <BrandButton component={Link} href="/orders">
            View my orders
          </BrandButton>
        }
      />
    );
  }
  if (error?.status === 403) {
    return (
      <EmptyState
        titleOrder={2}
        color="warning"
        icon={<IconLock stroke={1.6} />}
        title="This order belongs to another account"
        description="You can only view orders placed with the account you're signed in to."
        action={
          <BrandButton component={Link} href="/orders">
            View my orders
          </BrandButton>
        }
      />
    );
  }
  return (
    <EmptyState
      titleOrder={2}
      color="gray"
      icon={<IconWifiOff stroke={1.6} />}
      title="We couldn't load this order"
      description={getErrorMessage(error, "Something went wrong. Please try again.")}
      action={
        onRetry ? (
          <Button variant="outline" color="primaryPink" radius="xl" leftSection={<IconRefresh size={16} aria-hidden />} onClick={onRetry}>
            Try again
          </Button>
        ) : null
      }
    />
  );
}

/** Mirrors the order detail layout (header, items, timeline, sidebar cards). */
export function OrderDetailSkeleton() {
  return (
    <Container size="lg" py={{ base: "lg", md: "xl" }} aria-busy="true" aria-label="Loading order">
      <Skeleton h={14} w={110} radius="xl" mb="md" />
      <Paper withBorder radius="md" p={{ base: "md", sm: "lg" }} mb="lg" bg={semantic.surface}>
        <Group justify="space-between" wrap="wrap" gap="md">
          <Stack gap={8}>
            <Skeleton h={28} w={280} radius="xl" />
            <Skeleton h={14} w={180} radius="xl" />
          </Stack>
          <Group gap="xs">
            <Skeleton h={24} w={90} radius="xl" />
            <Skeleton h={24} w={120} radius="xl" />
          </Group>
        </Group>
        <Group gap="sm" mt="lg">
          <Skeleton h={36} w={130} radius="xl" />
          <Skeleton h={36} w={160} radius="xl" />
        </Group>
      </Paper>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper withBorder radius="md" p="lg" mb="lg" bg={semantic.surface}>
            <Skeleton h={20} w={110} radius="xl" mb="md" />
            {[0, 1].map((row) => (
              <Group key={row} wrap="nowrap" align="flex-start" py="md">
                <Skeleton w={64} h={64} radius="md" />
                <Stack gap={8} style={{ flex: 1 }}>
                  <Skeleton h={14} w="70%" radius="xl" />
                  <Skeleton h={12} w="35%" radius="xl" />
                  <Skeleton h={20} w={180} radius="xl" />
                </Stack>
              </Group>
            ))}
          </Paper>
          <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
            <Skeleton h={20} w={140} radius="xl" mb="md" />
            {[0, 1, 2].map((row) => (
              <Group key={row} wrap="nowrap" align="flex-start" mb="md">
                <Skeleton circle h={28} />
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton h={14} w={120} radius="xl" />
                  <Skeleton h={12} w={200} radius="xl" />
                </Stack>
              </Group>
            ))}
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 4 }}>
          {[4, 4, 2].map((rows, card) => (
            <Paper key={card} withBorder radius="md" p="lg" mb="lg" bg={semantic.surface}>
              <Skeleton h={18} w={120} radius="xl" mb="md" />
              {Array.from({ length: rows }, (_, row) => (
                <Skeleton key={row} h={12} w={`${90 - row * 12}%`} radius="xl" mb={10} />
              ))}
            </Paper>
          ))}
        </Grid.Col>
      </Grid>
    </Container>
  );
}
