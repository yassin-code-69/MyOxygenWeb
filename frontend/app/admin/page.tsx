"use client";

import React, { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  Container,
  Paper,
  Title,
  Text,
  Group,
  Stack,
  Button,
  Table,
  Badge,
  Grid,
  Box,
  ThemeIcon,
  Progress,
  ActionIcon,
  Tooltip,
  Skeleton,
} from "@mantine/core";
import {
  IconReceipt2,
  IconTruckDelivery,
  IconAlertTriangle,
  IconCalendarTime,
  IconTrendingUp,
  IconFileSpreadsheet,
  IconRefresh,
  IconArrowUpRight,
  IconClock,
} from "@tabler/icons-react";
import { apiGet } from "../../lib/api-client";
import { StatusBadge } from "../../components/StatusBadge";

export interface OrdersByStatus {
  PENDING?: number;
  PROCESSING?: number;
  SHIPPED?: number;
  DELIVERED?: number;
  CANCELLED?: number;
  [key: string]: number | undefined;
}

export interface RecentOrderItem {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  status: string;
  totalAmount: number;
  itemsCount?: number;
  createdAt: string;
  paymentMethod?: string;
}

export interface AnalyticsSummary {
  totalRevenue: number;
  totalOrders: number;
  lowStockCount: number;
  expiringSoonCount: number;
  revenueTrendPercent?: number;
  ordersByStatus?: OrdersByStatus;
  recentOrders?: RecentOrderItem[];
}

const MOCK_SUMMARY: AnalyticsSummary = {
  totalRevenue: 584250,
  totalOrders: 1248,
  lowStockCount: 7,
  expiringSoonCount: 4,
  revenueTrendPercent: 14.8,
  ordersByStatus: {
    DELIVERED: 975,
    SHIPPED: 120,
    PROCESSING: 86,
    PENDING: 42,
    CANCELLED: 25,
  },
  recentOrders: [
    {
      id: "ord-8419",
      orderNumber: "ORD-20260922-8419",
      customerName: "Nusrat Jahan",
      customerPhone: "01712-345678",
      itemsCount: 3,
      status: "PENDING",
      totalAmount: 3450,
      createdAt: "12 mins ago",
      paymentMethod: "Cash on Delivery",
    },
    {
      id: "ord-8418",
      orderNumber: "ORD-20260922-8418",
      customerName: "Tanvir Ahmed",
      customerPhone: "01819-876543",
      itemsCount: 2,
      status: "PROCESSING",
      totalAmount: 1820,
      createdAt: "35 mins ago",
      paymentMethod: "bKash Online",
    },
    {
      id: "ord-8417",
      orderNumber: "ORD-20260922-8417",
      customerName: "Farhana Islam",
      customerPhone: "01911-234567",
      itemsCount: 5,
      status: "SHIPPED",
      totalAmount: 5600,
      createdAt: "1 hour ago",
      paymentMethod: "Cash on Delivery",
    },
    {
      id: "ord-8416",
      orderNumber: "ORD-20260922-8416",
      customerName: "Md. Rafiqul Hassan",
      customerPhone: "01623-456789",
      itemsCount: 1,
      status: "DELIVERED",
      totalAmount: 2150,
      createdAt: "3 hours ago",
      paymentMethod: "bKash Online",
    },
    {
      id: "ord-8415",
      orderNumber: "ORD-20260922-8415",
      customerName: "Shamima Nasreen",
      customerPhone: "01788-990011",
      itemsCount: 4,
      status: "PROCESSING",
      totalAmount: 4100,
      createdAt: "5 hours ago",
      paymentMethod: "Nagad",
    },
  ],
};

export default function AdminDashboardPage() {
  const [isLiveTelemetry, setIsLiveTelemetry] = useState(false);

  // Fetch telemetry from backend or fallback to mock in dev/unauthenticated
  const { data, isLoading, mutate, isValidating } = useSWR<AnalyticsSummary>(
    "/admin/analytics/summary",
    async (path) => {
      try {
        const res = await apiGet<any>(path);
        const payload = res?.data ?? res;
        if (payload && typeof payload.totalRevenue === "number") {
          setIsLiveTelemetry(true);
          return payload;
        }
        setIsLiveTelemetry(false);
        return MOCK_SUMMARY;
      } catch {
        // Fallback for unauthenticated dev environment
        setIsLiveTelemetry(false);
        return MOCK_SUMMARY;
      }
    },
    {
      fallbackData: MOCK_SUMMARY,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
    }
  );

  const summary = data || MOCK_SUMMARY;
  const ordersByStatus = summary.ordersByStatus || MOCK_SUMMARY.ordersByStatus!;
  const recentOrders = summary.recentOrders || MOCK_SUMMARY.recentOrders!;

  // Calculate order status distribution percentages
  const delivered = ordersByStatus.DELIVERED || 0;
  const shipped = ordersByStatus.SHIPPED || 0;
  const processing = ordersByStatus.PROCESSING || 0;
  const pending = ordersByStatus.PENDING || 0;
  const totalTrackedOrders = delivered + shipped + processing + pending || 1;

  const pctDelivered = Math.round((delivered / totalTrackedOrders) * 100);
  const pctShipped = Math.round((shipped / totalTrackedOrders) * 100);
  const pctProcessing = Math.round((processing / totalTrackedOrders) * 100);
  const pctPending = Math.max(0, 100 - pctDelivered - pctShipped - pctProcessing);

  return (
    <Container size="xl" py="sm" px={{ base: "xs", sm: "md" }}>
      {/* Top Title & Header Actions */}
      <Stack gap="lg" mb="xl">
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Group gap="xs" align="center" mb={4}>
              <Title
                order={2}
                fw={800}
                c="#1F2937"
                style={{ letterSpacing: "-0.5px" }}
              >
                Analytics & Operations Dashboard
              </Title>
              <Badge
                variant="dot"
                color={isLiveTelemetry ? "green" : "yellow"}
                size="sm"
                radius="xl"
              >
                {isLiveTelemetry ? "Live Telemetry" : "Dev Mock Telemetry"}
              </Badge>
            </Group>
            <Text size="sm" c="#6B7280">
              Real-time sales performance, perishable batch safety, and fulfillment operations.
            </Text>
          </Box>

          {/* Quick Action Buttons */}
          <Group gap="sm" wrap="wrap">
            <Tooltip label="Refresh Analytics" position="bottom">
              <ActionIcon
                variant="light"
                color="gray"
                size="lg"
                radius="md"
                loading={isValidating}
                onClick={() => mutate()}
                aria-label="Refresh telemetry data"
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>

            <Button
              component={Link}
              href="/admin/batches"
              leftSection={<IconCalendarTime size={18} stroke={2} />}
              variant="outline"
              color="pink"
              radius="md"
              style={{
                borderColor: "#FF6B8B",
                color: "#FF6B8B",
                backgroundColor: "#FFFFFF",
                fontWeight: 650,
              }}
            >
              Inspect Batches
            </Button>

            <Button
              component={Link}
              href="/admin/orders"
              leftSection={<IconTruckDelivery size={18} stroke={2} />}
              radius="md"
              style={{
                backgroundColor: "#FF6B8B",
                color: "#FFFFFF",
                fontWeight: 650,
                boxShadow: "0 2px 8px rgba(255, 107, 139, 0.28)",
              }}
            >
              Manage Orders
            </Button>

            <Button
              component={Link}
              href="/admin/ledger"
              leftSection={<IconFileSpreadsheet size={18} stroke={2} />}
              variant="light"
              color="gray"
              radius="md"
              style={{
                backgroundColor: "#FFFFFF",
                color: "#374151",
                border: "1px solid #E5E7EB",
                fontWeight: 650,
              }}
            >
              View Stock Ledger
            </Button>
          </Group>
        </Group>

        {/* 4-Column Mantine Grid for Telemetry Metrics */}
        <Grid gap="lg">
          {/* Card 1: Total Revenue */}
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <Paper
              p="lg"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #F3F4F6",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Text size="xs" fw={700} c="#6B7280" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Total Revenue
                  </Text>
                  <ThemeIcon
                    size={38}
                    radius="md"
                    style={{
                      background: "linear-gradient(135deg, rgba(76, 175, 125, 0.15) 0%, rgba(76, 175, 125, 0.25) 100%)",
                      color: "#4CAF7D",
                    }}
                  >
                    <IconReceipt2 size={20} stroke={2} />
                  </ThemeIcon>
                </Group>

                {isLoading ? (
                  <Skeleton height={36} width="65%" mb="xs" />
                ) : (
                  <Text fw={850} size="28px" c="#1F2937" style={{ lineHeight: 1.15 }}>
                    ৳ {summary.totalRevenue.toLocaleString()}
                  </Text>
                )}
              </Box>

              <Box mt="md">
                <Group gap={6} align="center">
                  <Badge
                    color="green"
                    variant="light"
                    size="sm"
                    radius="xl"
                    leftSection={<IconTrendingUp size={12} stroke={2.5} />}
                    style={{
                      backgroundColor: "rgba(16, 185, 129, 0.12)",
                      color: "#10B981",
                      fontWeight: 700,
                    }}
                  >
                    +{summary.revenueTrendPercent || 14.8}% vs last month
                  </Badge>
                </Group>
                <Text size="11px" c="#9CA3AF" mt={4}>
                  Completed and paid transactions
                </Text>
              </Box>
            </Paper>
          </Grid.Col>

          {/* Card 2: Total Orders */}
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <Paper
              p="lg"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #F3F4F6",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Text size="xs" fw={700} c="#6B7280" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Total Orders
                  </Text>
                  <ThemeIcon
                    size={38}
                    radius="md"
                    style={{
                      background: "linear-gradient(135deg, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0.22) 100%)",
                      color: "#2563EB",
                    }}
                  >
                    <IconTruckDelivery size={20} stroke={2} />
                  </ThemeIcon>
                </Group>

                {isLoading ? (
                  <Skeleton height={36} width="50%" mb="xs" />
                ) : (
                  <Text fw={850} size="28px" c="#1F2937" style={{ lineHeight: 1.15 }}>
                    {summary.totalOrders.toLocaleString()}
                  </Text>
                )}
              </Box>

              <Box mt="xs">
                {/* Progress bar by status */}
                <Progress.Root size="sm" radius="xl" mt={4}>
                  <Tooltip label={`Delivered: ${delivered} (${pctDelivered}%)`}>
                    <Progress.Section value={pctDelivered} color="green" />
                  </Tooltip>
                  <Tooltip label={`Shipped: ${shipped} (${pctShipped}%)`}>
                    <Progress.Section value={pctShipped} color="cyan" />
                  </Tooltip>
                  <Tooltip label={`Processing: ${processing} (${pctProcessing}%)`}>
                    <Progress.Section value={pctProcessing} color="blue" />
                  </Tooltip>
                  <Tooltip label={`Pending: ${pending} (${pctPending}%)`}>
                    <Progress.Section value={pctPending} color="yellow" />
                  </Tooltip>
                </Progress.Root>

                <Group justify="space-between" mt={6} style={{ fontSize: "11px", color: "#6B7280" }}>
                  <Text size="11px" c="green" fw={600}>
                    {delivered} Delivered
                  </Text>
                  <Text size="11px" c="blue" fw={600}>
                    {processing} Processing
                  </Text>
                  <Text size="11px" c="#D97706" fw={600}>
                    {pending} Pending
                  </Text>
                </Group>
              </Box>
            </Paper>
          </Grid.Col>

          {/* Card 3: Low Stock Warnings */}
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <Paper
              p="lg"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #FEF3C7",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Text size="xs" fw={700} c="#92400E" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Low Stock Warnings
                  </Text>
                  <ThemeIcon
                    size={38}
                    radius="md"
                    style={{
                      background: "rgba(245, 158, 11, 0.15)",
                      color: "#F59E0B",
                    }}
                  >
                    <IconAlertTriangle size={20} stroke={2} />
                  </ThemeIcon>
                </Group>

                {isLoading ? (
                  <Skeleton height={36} width="40%" mb="xs" />
                ) : (
                  <Text fw={850} size="28px" c="#B45309" style={{ lineHeight: 1.15 }}>
                    {summary.lowStockCount}
                  </Text>
                )}
              </Box>

              <Box mt="md">
                <Group gap={6} align="center">
                  <Badge
                    size="sm"
                    radius="xl"
                    style={{
                      backgroundColor: "rgba(245, 158, 11, 0.18)",
                      color: "#F59E0B",
                      border: "1px solid rgba(245, 158, 11, 0.35)",
                      fontWeight: 750,
                      letterSpacing: "0.4px",
                    }}
                  >
                    #F59E0B Warning Yellow
                  </Badge>
                </Group>
                <Text size="11px" c="#9CA3AF" mt={4}>
                  Items at or below safety threshold
                </Text>
              </Box>
            </Paper>
          </Grid.Col>

          {/* Card 4: Expiring Batches (≤30 Days) */}
          <Grid.Col span={{ base: 12, sm: 6, lg: 3 }}>
            <Paper
              p="lg"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #FEE2E2",
                boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                position: "relative",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              <Box>
                <Group justify="space-between" align="flex-start" mb="xs">
                  <Text size="xs" fw={700} c="#991B1B" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                    Expiring Batches (≤30 Days)
                  </Text>
                  <ThemeIcon
                    size={38}
                    radius="md"
                    style={{
                      background: "rgba(239, 68, 68, 0.15)",
                      color: "#EF4444",
                    }}
                  >
                    <IconCalendarTime size={20} stroke={2} />
                  </ThemeIcon>
                </Group>

                {isLoading ? (
                  <Skeleton height={36} width="40%" mb="xs" />
                ) : (
                  <Text fw={850} size="28px" c="#DC2626" style={{ lineHeight: 1.15 }}>
                    {summary.expiringSoonCount}
                  </Text>
                )}
              </Box>

              <Box mt="md">
                <Group gap={6} align="center">
                  <Badge
                    size="sm"
                    radius="xl"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.18)",
                      color: "#EF4444",
                      border: "1px solid rgba(239, 68, 68, 0.35)",
                      fontWeight: 750,
                      letterSpacing: "0.4px",
                    }}
                  >
                    #EF4444 Error Red
                  </Badge>
                </Group>
                <Text size="11px" c="#9CA3AF" mt={4}>
                  Perishable batches requiring FEFO discount
                </Text>
              </Box>
            </Paper>
          </Grid.Col>
        </Grid>

        {/* Action Callouts Banner */}
        <Paper
          p="md"
          radius="lg"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #FEE2E2",
            boxShadow: "0 1px 3px rgba(0, 0, 0, 0.02)",
          }}
        >
          <Grid align="center" gap="md">
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Group gap="sm" align="flex-start">
                <ThemeIcon size={36} radius="md" style={{ backgroundColor: "#FFF0F3", color: "#FF6B8B" }}>
                  <IconClock size={20} />
                </ThemeIcon>
                <Box>
                  <Text size="sm" fw={700} c="#1F2937">
                    FEFO Batch Expiry & Reorder Priority
                  </Text>
                  <Text size="xs" c="#6B7280">
                    {summary.expiringSoonCount} perishable batches require clearance action within 30 days. {summary.lowStockCount} inventory items reached safety reorder levels.
                  </Text>
                </Box>
              </Group>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Group justify="flex-end" gap="xs">
                <Button
                  component={Link}
                  href="/admin/batches"
                  size="xs"
                  variant="filled"
                  style={{ backgroundColor: "#FF6B8B", color: "#FFFFFF", fontWeight: 600 }}
                >
                  Review Batches
                </Button>
                <Button
                  component={Link}
                  href="/admin/ledger"
                  size="xs"
                  variant="default"
                  style={{ fontWeight: 600 }}
                >
                  Audit Ledger
                </Button>
              </Group>
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Recent Orders Preview Table */}
        <Paper
          radius="lg"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #F3F4F6",
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.04)",
            overflow: "hidden",
          }}
        >
          {/* Table Header Section */}
          <Group justify="space-between" align="center" p="lg" style={{ borderBottom: "1px solid #F3F4F6" }}>
            <Box>
              <Title order={4} fw={750} c="#1F2937">
                Recent Orders Preview
              </Title>
              <Text size="xs" c="#6B7280">
                Latest customer purchases requiring order fulfillment and dispatch
              </Text>
            </Box>

            <Button
              component={Link}
              href="/admin/orders"
              size="xs"
              variant="subtle"
              color="pink"
              rightSection={<IconArrowUpRight size={14} />}
              style={{ fontWeight: 650, color: "#FF6B8B" }}
            >
              Manage All Orders
            </Button>
          </Group>

          {/* Table Content */}
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" horizontalSpacing="lg" highlightOnHover>
              <Table.Thead style={{ backgroundColor: "#F9FAFB" }}>
                <Table.Tr>
                  <Table.Th style={{ color: "#4B5563", fontSize: "12px", textTransform: "uppercase" }}>
                    Order Number
                  </Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontSize: "12px", textTransform: "uppercase" }}>
                    Customer
                  </Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontSize: "12px", textTransform: "uppercase" }}>
                    Time / Placed
                  </Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontSize: "12px", textTransform: "uppercase" }}>
                    Status
                  </Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontSize: "12px", textTransform: "uppercase", textAlign: "right" }}>
                    Total Amount
                  </Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontSize: "12px", textTransform: "uppercase", textAlign: "right" }}>
                    Action
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {recentOrders.map((order) => (
                  <Table.Tr key={order.id || order.orderNumber} style={{ transition: "background 0.15s ease" }}>
                    {/* Order Number */}
                    <Table.Td>
                      <Group gap="xs">
                        <ThemeIcon size={26} radius="sm" variant="light" color="pink" style={{ backgroundColor: "#FFF0F3", color: "#FF6B8B" }}>
                          <IconReceipt2 size={14} />
                        </ThemeIcon>
                        <Box>
                          <Text
                            component={Link}
                            href="/admin/orders"
                            fw={700}
                            size="sm"
                            c="#1F2937"
                            style={{
                              textDecoration: "none",
                              fontFamily: "monospace",
                              letterSpacing: "-0.3px",
                            }}
                          >
                            {order.orderNumber}
                          </Text>
                          {order.paymentMethod && (
                            <Text size="11px" c="#9CA3AF">
                              {order.paymentMethod}
                            </Text>
                          )}
                        </Box>
                      </Group>
                    </Table.Td>

                    {/* Customer Info */}
                    <Table.Td>
                      <Text size="sm" fw={600} c="#1F2937">
                        {order.customerName}
                      </Text>
                      {order.customerPhone && (
                        <Text size="11px" c="#6B7280">
                          {order.customerPhone}
                        </Text>
                      )}
                    </Table.Td>

                    {/* Time / Placed */}
                    <Table.Td>
                      <Text size="xs" c="#6B7280">
                        {order.createdAt}
                      </Text>
                      {order.itemsCount && (
                        <Text size="11px" c="#9CA3AF">
                          {order.itemsCount} {order.itemsCount === 1 ? "item" : "items"}
                        </Text>
                      )}
                    </Table.Td>

                    {/* Status Badge */}
                    <Table.Td>
                      <StatusBadge status={order.status} size="sm" />
                    </Table.Td>

                    {/* Total */}
                    <Table.Td style={{ textAlign: "right" }}>
                      <Text fw={750} size="sm" c="#1F2937">
                        ৳ {order.totalAmount.toLocaleString()}
                      </Text>
                    </Table.Td>

                    {/* Action */}
                    <Table.Td style={{ textAlign: "right" }}>
                      <Button
                        component={Link}
                        href="/admin/orders"
                        size="compact-xs"
                        variant="light"
                        color="pink"
                        style={{
                          backgroundColor: "#FFF0F3",
                          color: "#FF6B8B",
                          fontWeight: 650,
                          borderRadius: "6px",
                        }}
                      >
                        Manage
                      </Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Paper>
      </Stack>
    </Container>
  );
}
