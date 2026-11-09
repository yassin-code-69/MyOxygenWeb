"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button, Container, Group, Pagination, Stack, Text, Title } from "@mantine/core";
import { IconAlertCircle, IconReceipt2, IconRefresh } from "@tabler/icons-react";
import { motion } from "motion/react";
import { BrandButton } from "../BrandButton";
import { EmptyState } from "../EmptyState";
import { startPageProgress } from "../PageProgressBar";
import { OrderCard, OrderCardSkeleton } from "./OrderCard";
import { useRequireAuth } from "../../hooks/auth/use-auth-ready";
import { useMyOrders } from "../../hooks/orders/use-orders";
import { getErrorMessage } from "../../lib/api-client";
import { staggerContainer, fadeInUp } from "../../lib/animations";
import { semantic } from "../../tokens";

const PAGE_SIZE = 10;

function readPage(raw: string | null): number {
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page >= 1 ? page : 1;
}

/** `/orders` — the signed-in customer's orders, newest first. */
export function MyOrdersView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = readPage(searchParams.get("page"));
  const { status } = useRequireAuth(page > 1 ? `/orders?page=${page}` : "/orders");
  const { orders, meta, error, isLoading, isValidating, mutate } = useMyOrders(page, PAGE_SIZE, status === "authenticated");

  const goToPage = (next: number) => {
    startPageProgress();
    router.push(next > 1 ? `/orders?page=${next}` : "/orders");
  };

  const total = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 0;
  const showSkeleton = status !== "authenticated" || (isLoading && orders.length === 0);

  return (
    <Container size="md" py={{ base: "lg", md: "xl" }}>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="xs">
        <Stack gap={2}>
          <Title order={1} size="h2" c={semantic.text}>
            My orders
          </Title>
          <Text size="sm" c="dimmed" aria-live="polite">
            {showSkeleton ? "Loading your orders…" : `${total} ${total === 1 ? "order" : "orders"} in total`}
          </Text>
        </Stack>
        <BrandButton component={Link} href="/products" variant="ghost" size="sm">
          Continue shopping
        </BrandButton>
      </Group>

      {error && orders.length === 0 ? (
        <Alert
          color="danger"
          variant="light"
          radius="md"
          icon={<IconAlertCircle size={18} />}
          title="We couldn't load your orders"
          role="alert"
        >
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{getErrorMessage(error)}</Text>
            <Button
              size="xs"
              variant="outline"
              color="primaryPink"
              radius="xl"
              leftSection={<IconRefresh size={14} aria-hidden />}
              onClick={() => void mutate()}
            >
              Try again
            </Button>
          </Stack>
        </Alert>
      ) : showSkeleton ? (
        <Stack gap="md" aria-busy="true" aria-label="Loading orders">
          {[0, 1, 2].map((row) => (
            <OrderCardSkeleton key={row} />
          ))}
        </Stack>
      ) : orders.length === 0 ? (
        <EmptyState
          titleOrder={2}
          icon={<IconReceipt2 stroke={1.6} />}
          title={page > 1 ? "No orders on this page" : "No orders yet"}
          description={
            page > 1
              ? "This page is empty — your orders start on the first page."
              : "When you place an order it will appear here, with live status and invoices."
          }
          action={
            page > 1 ? (
              <BrandButton component={Link} href="/orders">
                Back to first page
              </BrandButton>
            ) : (
              <BrandButton component={Link} href="/products">
                Start shopping
              </BrandButton>
            )
          }
        />
      ) : (
        <Stack gap="lg">
          <motion.ul
            key={page}
            variants={staggerContainer}
            initial="initial"
            animate="animate"
            aria-busy={isValidating}
            style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 16 }}
          >
            {orders.map((order) => (
              <motion.li key={order.id} variants={fadeInUp}>
                <OrderCard order={order} />
              </motion.li>
            ))}
          </motion.ul>
          {totalPages > 1 ? (
            <Group justify="center">
              <Pagination
                total={totalPages}
                value={Math.min(page, totalPages)}
                onChange={goToPage}
                getControlProps={(control) => ({
                  "aria-label": control === "previous" ? "Previous page" : control === "next" ? "Next page" : control,
                })}
                getItemProps={(item) => ({ "aria-label": `Page ${item}` })}
              />
            </Group>
          ) : null}
        </Stack>
      )}
    </Container>
  );
}

/** Suspense fallback with the same footprint as the loaded list. */
export function MyOrdersSkeleton() {
  return (
    <Container size="md" py={{ base: "lg", md: "xl" }} aria-busy="true" aria-label="Loading orders">
      <Stack gap={6} mb="lg">
        <Title order={1} size="h2" c={semantic.text}>
          My orders
        </Title>
        <Text size="sm" c="dimmed">
          Loading your orders…
        </Text>
      </Stack>
      <Stack gap="md">
        {[0, 1, 2].map((row) => (
          <OrderCardSkeleton key={row} />
        ))}
      </Stack>
    </Container>
  );
}
