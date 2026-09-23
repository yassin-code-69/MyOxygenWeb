"use client";

import React, { useState, useMemo } from "react";
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
  Box,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Pagination,
} from "@mantine/core";
import {
  IconHistory,
  IconRefresh,
  IconAlertTriangle,
  IconCalendar,
  IconBarcode,
  IconFileAlert,
  IconArrowUpRight,
  IconArrowDownRight,
  IconUser,
  IconFilter,
} from "@tabler/icons-react";
import useSWR from "swr";
import { apiGet } from "../../../lib/api-client";
import { myOxygenColors } from "../../../tokens";
import type { StockLedgerItemDTO } from "../../../types";

type ReasonFilter =
  | "All"
  | "IMPORT"
  | "PURCHASE"
  | "RETURN"
  | "EXPIRED_SCRAP"
  | "ADJUSTMENT";

const REASON_OPTIONS: ReasonFilter[] = [
  "All",
  "IMPORT",
  "PURCHASE",
  "RETURN",
  "EXPIRED_SCRAP",
  "ADJUSTMENT",
];

export default function StockAuditLedgerPage() {
  const [activeReason, setActiveReason] = useState<ReasonFilter>("All");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Build query string for GET /admin/inventory/ledger
  const queryParams = useMemo(() => {
    const params: Record<string, any> = {
      page,
      limit: pageSize,
    };
    if (activeReason !== "All") {
      params.reason = activeReason;
    }
    return params;
  }, [page, activeReason]);

  // SWR fetch from GET /admin/inventory/ledger
  const {
    data: ledgerResponse,
    error: ledgerError,
    isLoading: isLedgerLoading,
    mutate: refreshLedger,
  } = useSWR<any>(
    ["/admin/inventory/ledger", JSON.stringify(queryParams)],
    () => apiGet("/admin/inventory/ledger", queryParams),
    { revalidateOnFocus: true }
  );

  // Parse entries and pagination metadata
  const { entries, totalCount, totalPages } = useMemo(() => {
    const resData = ledgerResponse?.data || ledgerResponse || {};
    const list: StockLedgerItemDTO[] = Array.isArray(resData.entries)
      ? resData.entries
      : Array.isArray(resData)
      ? resData
      : [];
    const total = typeof resData.total === "number" ? resData.total : list.length;
    const pages =
      typeof resData.totalPages === "number"
        ? resData.totalPages
        : Math.ceil(total / pageSize) || 1;

    return {
      entries: list,
      totalCount: total,
      totalPages: Math.max(1, pages),
    };
  }, [ledgerResponse, pageSize]);

  // Format date helper
  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) {
      return "—";
    }
    try {
      const d = new Date(dateStr);
      return d.toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  };

  // Render Reason Badge
  const renderReasonBadge = (reason: string) => {
    const normalized = reason.toUpperCase();
    switch (normalized) {
      case "IMPORT":
        return (
          <Badge color="teal" variant="light" size="sm" radius="md" fw={700}>
            IMPORT
          </Badge>
        );
      case "PURCHASE":
        return (
          <Badge color="indigo" variant="light" size="sm" radius="md" fw={700}>
            PURCHASE
          </Badge>
        );
      case "RETURN":
        return (
          <Badge color="cyan" variant="light" size="sm" radius="md" fw={700}>
            RETURN
          </Badge>
        );
      case "EXPIRED_SCRAP":
        return (
          <Badge color="red" variant="filled" size="sm" radius="md" fw={700}>
            EXPIRED SCRAP
          </Badge>
        );
      case "MANUAL_ADJUSTMENT":
      case "ADJUSTMENT":
        return (
          <Badge color="orange" variant="light" size="sm" radius="md" fw={700}>
            ADJUSTMENT
          </Badge>
        );
      default:
        return (
          <Badge color="gray" variant="light" size="sm" radius="md" fw={700}>
            {reason}
          </Badge>
        );
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Group gap="xs" align="center">
              <IconHistory size={28} color={myOxygenColors.primaryPink} />
              <Title
                order={2}
                style={{
                  fontFamily: "var(--font-poppins)",
                  color: myOxygenColors.darkText,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                Stock Audit Ledger
              </Title>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Immutable chronological record of every physical inventory change, batch deduction, and manual adjustment.
            </Text>
          </Box>

          <Group gap="sm">
            <Tooltip label="Refresh audit ledger">
              <ActionIcon
                variant="default"
                size="lg"
                radius="md"
                onClick={() => refreshLedger()}
                loading={isLedgerLoading}
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Reason Filter Pills */}
        <Paper p="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
          <Group justify="space-between" align="center" wrap="wrap" gap="sm">
            <Group gap={6} align="center">
              <IconFilter size={18} color="#6B7280" />
              <Text size="sm" fw={650} c={myOxygenColors.darkText}>
                Filter Reason:
              </Text>
            </Group>

            <Group gap="xs" wrap="wrap">
              {REASON_OPTIONS.map((reason) => {
                const isActive = activeReason === reason;
                return (
                  <Button
                    key={reason}
                    variant={isActive ? "filled" : "light"}
                    color={isActive ? "pink" : "gray"}
                    radius="xl"
                    size="sm"
                    onClick={() => {
                      setActiveReason(reason);
                      setPage(1); // Reset to first page on filter switch
                    }}
                    style={{
                      backgroundColor: isActive ? myOxygenColors.primaryPink : undefined,
                      fontWeight: isActive ? 700 : 500,
                      transition: "all 150ms ease",
                    }}
                  >
                    {reason === "EXPIRED_SCRAP" ? "Expired Scrap" : reason}
                  </Button>
                );
              })}
            </Group>
          </Group>
        </Paper>

        {/* Ledger Table Container */}
        <Paper radius="md" withBorder style={{ backgroundColor: "#FFFFFF", overflow: "hidden" }}>
          {isLedgerLoading && entries.length === 0 ? (
            <Box py={60} style={{ textAlign: "center" }}>
              <Loader color="pink" size="md" />
              <Text size="sm" c="dimmed" mt="sm">
                Loading stock history ledger...
              </Text>
            </Box>
          ) : ledgerError && entries.length === 0 ? (
            <Box p="xl">
              <Alert icon={<IconAlertTriangle size={18} />} title="Error Loading Ledger" color="red">
                {ledgerError?.message ||
                  "Could not retrieve audit ledger records. Please ensure backend service is reachable."}
                <Group mt="sm">
                  <Button size="xs" variant="outline" color="red" onClick={() => refreshLedger()}>
                    Try Again
                  </Button>
                </Group>
              </Alert>
            </Box>
          ) : entries.length === 0 ? (
            <Box py={60} px="md" style={{ textAlign: "center" }}>
              <IconFileAlert size={44} color="#9CA3AF" style={{ margin: "0 auto", strokeWidth: 1.5 }} />
              <Text fw={600} size="md" c={myOxygenColors.darkText} mt="md">
                No ledger entries recorded
              </Text>
              <Text size="sm" c="dimmed" mt={4} maw={400} mx="auto">
                {activeReason !== "All"
                  ? `No transactions found under reason "${activeReason}". Try selecting "All" to view full stock activity.`
                  : "No inventory stock movements have been recorded yet."}
              </Text>
              {activeReason !== "All" && (
                <Button
                  variant="subtle"
                  color="pink"
                  size="xs"
                  mt="sm"
                  onClick={() => {
                    setActiveReason("All");
                    setPage(1);
                  }}
                >
                  Clear Reason Filter
                </Button>
              )}
            </Box>
          ) : (
            <Table.ScrollContainer minWidth={950}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead style={{ backgroundColor: "#F9FAFB" }}>
                  <Table.Tr>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Date / Time
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Product
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Batch #
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13, textAlign: "right" }}>
                      Change (+/- Qty)
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Reason
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Note
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Performed By
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {entries.map((entry) => {
                    const delta = entry.changeDelta ?? 0;
                    const isPositive = delta > 0;
                    const isNegative = delta < 0;

                    return (
                      <Table.Tr key={entry.id}>
                        {/* Date/Time */}
                        <Table.Td>
                          <Group gap={6} align="center">
                            <IconCalendar size={14} color="#9CA3AF" />
                            <Text size="xs" fw={550} c={myOxygenColors.darkText} style={{ whiteSpace: "nowrap" }}>
                              {formatDateTime(entry.createdAt)}
                            </Text>
                          </Group>
                        </Table.Td>

                        {/* Product */}
                        <Table.Td>
                          <Stack gap={2}>
                            <Text fw={600} size="sm" c={myOxygenColors.darkText} lineClamp={1}>
                              {entry.product?.title || "Unknown Product"}
                            </Text>
                            {entry.product?.sku && (
                              <Text size="xs" c="dimmed" style={{ fontFamily: "monospace" }}>
                                SKU: {entry.product.sku}
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>

                        {/* Batch # */}
                        <Table.Td>
                          {entry.batch?.batchNumber ? (
                            <Group gap={4} align="center">
                              <IconBarcode size={15} color="#6B7280" />
                              <Text fw={600} size="xs" c={myOxygenColors.darkText} style={{ fontFamily: "monospace" }}>
                                {entry.batch.batchNumber}
                              </Text>
                            </Group>
                          ) : (
                            <Text size="xs" c="dimmed">
                              —
                            </Text>
                          )}
                        </Table.Td>

                        {/* Change (+/- Qty) */}
                        <Table.Td style={{ textAlign: "right" }}>
                          <Group gap={4} justify="flex-end" align="center">
                            {isPositive && <IconArrowUpRight size={16} color="#10B981" stroke={2.5} />}
                            {isNegative && <IconArrowDownRight size={16} color="#EF4444" stroke={2.5} />}
                            <Text
                              fw={750}
                              size="sm"
                              c={isPositive ? "green.7" : isNegative ? "red.7" : "gray.6"}
                            >
                              {isPositive ? `+${delta}` : delta}
                            </Text>
                          </Group>
                          <Text size="10px" c="dimmed" mt={1}>
                            Bal: {entry.balanceAfter ?? "—"}
                          </Text>
                        </Table.Td>

                        {/* Reason badge */}
                        <Table.Td>
                          {renderReasonBadge(entry.reason)}
                        </Table.Td>

                        {/* Note */}
                        <Table.Td style={{ maxWidth: 220 }}>
                          <Text size="xs" c={entry.note ? myOxygenColors.darkText : "dimmed"} lineClamp={2}>
                            {entry.note || "—"}
                          </Text>
                        </Table.Td>

                        {/* Performed By */}
                        <Table.Td>
                          {entry.performedBy ? (
                            <Group gap={6} align="center">
                              <IconUser size={14} color="#6B7280" />
                              <Box>
                                <Text size="xs" fw={600} c={myOxygenColors.darkText} lineClamp={1}>
                                  {entry.performedBy.fullName || "Staff"}
                                </Text>
                                <Text size="10px" c="dimmed" tt="uppercase">
                                  {entry.performedBy.role}
                                </Text>
                              </Box>
                            </Group>
                          ) : (
                            <Badge color="gray" variant="dot" size="xs" radius="sm">
                              Automated System
                            </Badge>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          {/* Mantine Pagination Controls & Footer */}
          <Box p="md" style={{ borderTop: "1px solid #F3F4F6", backgroundColor: "#FAFBFB" }}>
            <Group justify="space-between" align="center" wrap="wrap" gap="md">
              <Text size="xs" c="dimmed">
                Showing {entries.length > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
                {Math.min(page * pageSize, totalCount)} of {totalCount} total audit entries
              </Text>

              {totalPages > 1 && (
                <Pagination
                  total={totalPages}
                  value={page}
                  onChange={setPage}
                  color="pink"
                  radius="md"
                  size="sm"
                />
              )}
            </Group>
          </Box>
        </Paper>
      </Stack>
    </Container>
  );
}
