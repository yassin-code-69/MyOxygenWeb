"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
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
  TextInput,
  Select,
  Modal,
  Box,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Pagination,
  Divider,
  SimpleGrid,
  Card,
  ThemeIcon,
  rem,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconReceipt,
  IconSearch,
  IconRefresh,
  IconAlertTriangle,
  IconEye,
  IconDownload,
  IconExternalLink,
  IconPhone,
  IconCalendar,
  IconCreditCard,
  IconCash,
  IconFileInvoice,
  IconCheck,
  IconUser,
  IconMapPin,
  IconShoppingBag,
  IconBuildingStore,
} from "@tabler/icons-react";
import useSWR from "swr";
import { apiGet } from "../../../lib/api-client";
import { myOxygenColors } from "../../../tokens";
import type { AdminInvoiceDTO, AdminInvoicesResponse } from "../../../types";

const PAYMENT_STATUS_OPTIONS = [
  { value: "ALL", label: "All Payment Statuses" },
  { value: "PAID", label: "Paid" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PENDING", label: "Pending" },
  { value: "REFUNDED", label: "Refunded" },
  { value: "FAILED", label: "Failed" },
];

const PAYMENT_METHOD_OPTIONS = [
  { value: "ALL", label: "All Methods" },
  { value: "CASH_ON_DELIVERY", label: "Cash on Delivery" },
  { value: "BKASH", label: "bKash" },
  { value: "NAGAD", label: "Nagad" },
  { value: "CARD", label: "Card / Digital" },
];

export default function AdminInvoicesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("ALL");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("ALL");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState("10");

  // Detail Modal State
  const [selectedInvoice, setSelectedInvoice] = useState<AdminInvoiceDTO | null>(null);
  const [detailModalOpened, setDetailModalOpened] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // SWR Query Params
  const queryParams = useMemo(() => {
    const p: Record<string, any> = {
      page,
      limit: Number(limit),
    };
    if (searchQuery.trim()) p.q = searchQuery.trim();
    if (paymentStatusFilter !== "ALL") p.paymentStatus = paymentStatusFilter;
    if (paymentMethodFilter !== "ALL") p.paymentMethod = paymentMethodFilter;
    return p;
  }, [page, limit, searchQuery, paymentStatusFilter, paymentMethodFilter]);

  const {
    data: response,
    error,
    isLoading,
    isValidating,
    mutate,
  } = useSWR<AdminInvoicesResponse>(
    ["/admin/invoices", queryParams],
    ([url, params]) => apiGet(url as string, params as Record<string, any>),
    {
      revalidateOnFocus: true,
      dedupingInterval: 5000,
    },
  );

  const invoicesList = response?.data?.items || [];
  const pagination = response?.data?.pagination;
  const summary = response?.data?.summary;

  const handleOpenDetails = (invoice: AdminInvoiceDTO) => {
    setSelectedInvoice(invoice);
    setDetailModalOpened(true);
  };

  const handleDownloadPdf = async (invoice: AdminInvoiceDTO) => {
    try {
      setDownloadingId(invoice.id);
      const token = typeof window !== "undefined" ? localStorage.getItem("my_oxygen_token") : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

      const res = await fetch(`${apiUrl}/admin/invoices/${invoice.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to download PDF (${res.status})`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `${invoice.invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);

      notifications.show({
        title: "Invoice Downloaded",
        message: `Invoice ${invoice.invoiceNumber} downloaded successfully.`,
        color: "teal",
        icon: <IconCheck size={16} />,
      });
    } catch (err: any) {
      notifications.show({
        title: "Download Failed",
        message: err.message || "Failed to download invoice PDF",
        color: "red",
        icon: <IconAlertTriangle size={16} />,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleViewPdf = async (invoice: AdminInvoiceDTO) => {
    try {
      setDownloadingId(invoice.id);
      const token = typeof window !== "undefined" ? localStorage.getItem("my_oxygen_token") : null;
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

      const res = await fetch(`${apiUrl}/admin/invoices/${invoice.id}/pdf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`Failed to load PDF (${res.status})`);
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, "_blank");
    } catch (err: any) {
      notifications.show({
        title: "View Failed",
        message: err.message || "Failed to view invoice PDF",
        color: "red",
        icon: <IconAlertTriangle size={16} />,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toUpperCase()) {
      case "PAID":
        return "teal";
      case "UNPAID":
      case "PENDING":
        return "orange";
      case "REFUNDED":
        return "blue";
      case "FAILED":
      case "CANCELLED":
        return "red";
      default:
        return "gray";
    }
  };

  return (
    <Container size="xl" py="md">
      {/* Header Section */}
      <Group justify="space-between" align="flex-start" mb="lg">
        <Box>
          <Group gap="xs" align="center">
            <ThemeIcon
              size={36}
              radius="md"
              style={{
                background: "linear-gradient(135deg, #FF6B8B 0%, #FFA8BA 100%)",
                boxShadow: "0 2px 8px rgba(255, 107, 139, 0.3)",
              }}
            >
              <IconReceipt size={20} color="#FFFFFF" stroke={2.2} />
            </ThemeIcon>
            <Title order={2} fw={750} c="#1F2937">
              Invoices & Cash Memos
            </Title>
          </Group>
          <Text size="sm" c="#6B7280" mt={4}>
            Database-persisted invoice archive with item snapshots and instant zero-disk PDF streaming
          </Text>
        </Box>

        <Group gap="xs">
          <Button
            leftSection={<IconRefresh size={16} className={isValidating ? "animate-spin" : ""} />}
            variant="default"
            size="sm"
            radius="md"
            onClick={() => mutate()}
            disabled={isLoading || isValidating}
          >
            Refresh
          </Button>
        </Group>
      </Group>

      {/* Metrics Summary Cards */}
      <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="md" mb="lg">
        <Card
          withBorder
          radius="md"
          p="md"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#FEE2E2",
          }}
        >
          <Group justify="space-between" align="center">
            <Box>
              <Text size="xs" fw={700} c="#9CA3AF" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total Invoices
              </Text>
              <Text size="xl" fw={800} c="#1F2937" mt={4}>
                {summary?.totalInvoices ?? 0}
              </Text>
            </Box>
            <ThemeIcon size={42} radius="md" variant="light" color="pink">
              <IconFileInvoice size={22} stroke={1.8} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card
          withBorder
          radius="md"
          p="md"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#E5E7EB",
          }}
        >
          <Group justify="space-between" align="center">
            <Box>
              <Text size="xs" fw={700} c="#9CA3AF" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Total Billed Revenue
              </Text>
              <Text size="xl" fw={800} c="#1F2937" mt={4}>
                ৳{summary?.totalBilledAmount ? Number(summary.totalBilledAmount).toLocaleString() : "0.00"}
              </Text>
            </Box>
            <ThemeIcon size={42} radius="md" variant="light" color="teal">
              <IconReceipt size={22} stroke={1.8} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card
          withBorder
          radius="md"
          p="md"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#E5E7EB",
          }}
        >
          <Group justify="space-between" align="center">
            <Box>
              <Text size="xs" fw={700} c="#9CA3AF" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Cash On Delivery
              </Text>
              <Text size="xl" fw={800} c="#1F2937" mt={4}>
                {summary?.codCount ?? 0}
              </Text>
            </Box>
            <ThemeIcon size={42} radius="md" variant="light" color="blue">
              <IconCash size={22} stroke={1.8} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card
          withBorder
          radius="md"
          p="md"
          style={{
            backgroundColor: "#FFFFFF",
            borderColor: "#E5E7EB",
          }}
        >
          <Group justify="space-between" align="center">
            <Box>
              <Text size="xs" fw={700} c="#9CA3AF" style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Digital & Card
              </Text>
              <Text size="xl" fw={800} c="#1F2937" mt={4}>
                {summary?.digitalCount ?? 0}
              </Text>
            </Box>
            <ThemeIcon size={42} radius="md" variant="light" color="violet">
              <IconCreditCard size={22} stroke={1.8} />
            </ThemeIcon>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Filter and Search Bar */}
      <Paper
        withBorder
        p="md"
        radius="md"
        mb="lg"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#FEE2E2",
        }}
      >
        <Group justify="space-between" wrap="wrap" gap="md">
          <TextInput
            placeholder="Search by Invoice #, Order #, Customer, or Phone..."
            leftSection={<IconSearch size={16} color="#9CA3AF" />}
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.currentTarget.value);
              setPage(1);
            }}
            style={{ flex: 1, minWidth: 280 }}
            radius="md"
          />

          <Group gap="sm" wrap="wrap">
            <Select
              data={PAYMENT_STATUS_OPTIONS}
              value={paymentStatusFilter}
              onChange={(val) => {
                setPaymentStatusFilter(val || "ALL");
                setPage(1);
              }}
              style={{ width: 180 }}
              radius="md"
              aria-label="Filter by payment status"
            />

            <Select
              data={PAYMENT_METHOD_OPTIONS}
              value={paymentMethodFilter}
              onChange={(val) => {
                setPaymentMethodFilter(val || "ALL");
                setPage(1);
              }}
              style={{ width: 170 }}
              radius="md"
              aria-label="Filter by payment method"
            />

            <Select
              data={[
                { value: "10", label: "10 per page" },
                { value: "25", label: "25 per page" },
                { value: "50", label: "50 per page" },
              ]}
              value={limit}
              onChange={(val) => {
                setLimit(val || "10");
                setPage(1);
              }}
              style={{ width: 130 }}
              radius="md"
              aria-label="Rows per page"
            />
          </Group>
        </Group>
      </Paper>

      {/* Error Alert */}
      {error && (
        <Alert
          icon={<IconAlertTriangle size={16} />}
          title="Error Loading Invoices"
          color="red"
          radius="md"
          mb="lg"
        >
          {error.message || "Failed to load invoices from database"}
        </Alert>
      )}

      {/* Invoices Table */}
      <Paper
        withBorder
        radius="md"
        style={{
          backgroundColor: "#FFFFFF",
          borderColor: "#FEE2E2",
          overflow: "hidden",
        }}
      >
        {isLoading ? (
          <Box p="xl" style={{ textAlign: "center" }}>
            <Loader color="pink" size="md" />
            <Text size="sm" c="#6B7280" mt="sm">
              Loading invoices archive...
            </Text>
          </Box>
        ) : invoicesList.length === 0 ? (
          <Box p="xl" style={{ textAlign: "center" }}>
            <ThemeIcon size={48} radius="xl" variant="light" color="gray" mx="auto" mb="sm">
              <IconReceipt size={24} />
            </ThemeIcon>
            <Text fw={650} size="md" c="#374151">
              No Invoices Found
            </Text>
            <Text size="xs" c="#9CA3AF" mt={4}>
              {searchQuery || paymentStatusFilter !== "ALL" || paymentMethodFilter !== "ALL"
                ? "Try adjusting your search criteria or filters."
                : "Customer invoices will appear here immediately once orders are placed."}
            </Text>
          </Box>
        ) : (
          <Box style={{ overflowX: "auto" }}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead style={{ backgroundColor: "#FFF8F6" }}>
                <Table.Tr>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>INVOICE</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>ORDER #</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>CUSTOMER</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>DATE</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>ITEMS</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>AMOUNT</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px" }}>PAYMENT</Table.Th>
                  <Table.Th style={{ color: "#4B5563", fontWeight: 700, fontSize: "12px", textAlign: "right" }}>
                    ACTIONS
                  </Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {invoicesList.map((invoice) => (
                  <Table.Tr key={invoice.id}>
                    {/* Invoice Number */}
                    <Table.Td>
                      <Group gap={6}>
                        <ThemeIcon size={24} radius="sm" variant="light" color="pink">
                          <IconReceipt size={14} />
                        </ThemeIcon>
                        <Text size="xs" fw={700} c="#1F2937">
                          {invoice.invoiceNumber}
                        </Text>
                      </Group>
                    </Table.Td>

                    {/* Order Number */}
                    <Table.Td>
                      <Tooltip label="View Order in Admin Orders">
                        <Text
                          component={Link}
                          href={`/admin/orders`}
                          size="xs"
                          fw={600}
                          c="#FF6B8B"
                          style={{ textDecoration: "underline" }}
                        >
                          {invoice.orderNumber || invoice.orderId.slice(0, 8)}
                        </Text>
                      </Tooltip>
                    </Table.Td>

                    {/* Customer */}
                    <Table.Td>
                      <Text size="xs" fw={600} c="#1F2937">
                        {invoice.customerName}
                      </Text>
                      <Group gap={4} mt={2}>
                        <IconPhone size={12} color="#9CA3AF" />
                        <Text size="11px" c="#6B7280">
                          {invoice.customerPhone}
                        </Text>
                      </Group>
                    </Table.Td>

                    {/* Date */}
                    <Table.Td>
                      <Group gap={4}>
                        <IconCalendar size={13} color="#9CA3AF" />
                        <Text size="xs" c="#4B5563">
                          {new Date(invoice.createdAt).toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </Text>
                      </Group>
                    </Table.Td>

                    {/* Items */}
                    <Table.Td>
                      <Badge size="xs" variant="light" color="gray" radius="sm">
                        {invoice.itemsSnapshot?.length || 0} line item
                        {(invoice.itemsSnapshot?.length || 0) > 1 ? "s" : ""}
                      </Badge>
                    </Table.Td>

                    {/* Total Amount */}
                    <Table.Td>
                      <Text size="xs" fw={750} c="#1F2937">
                        ৳{parseFloat(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </Text>
                    </Table.Td>

                    {/* Payment Status & Method */}
                    <Table.Td>
                      <Stack gap={3}>
                        <Badge
                          size="xs"
                          variant="light"
                          color={getStatusBadgeColor(invoice.paymentStatus)}
                          radius="sm"
                        >
                          {invoice.paymentStatus}
                        </Badge>
                        <Text size="10px" c="#9CA3AF">
                          {invoice.paymentMethod.replace(/_/g, " ")}
                        </Text>
                      </Stack>
                    </Table.Td>

                    {/* Actions */}
                    <Table.Td style={{ textAlign: "right" }}>
                      <Group gap={6} justify="flex-end">
                        <Tooltip label="View Line Items Snapshot">
                          <ActionIcon
                            variant="light"
                            color="gray"
                            size="sm"
                            radius="md"
                            onClick={() => handleOpenDetails(invoice)}
                          >
                            <IconEye size={15} />
                          </ActionIcon>
                        </Tooltip>

                        <Tooltip label="View PDF in New Tab">
                          <ActionIcon
                            variant="light"
                            color="pink"
                            size="sm"
                            radius="md"
                            loading={downloadingId === invoice.id}
                            onClick={() => handleViewPdf(invoice)}
                          >
                            <IconExternalLink size={15} />
                          </ActionIcon>
                        </Tooltip>

                        <Tooltip label="Download PDF">
                          <ActionIcon
                            variant="light"
                            color="teal"
                            size="sm"
                            radius="md"
                            loading={downloadingId === invoice.id}
                            onClick={() => handleDownloadPdf(invoice)}
                          >
                            <IconDownload size={15} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {/* Pagination Controls */}
        {pagination && pagination.totalPages > 1 && (
          <Box p="md" style={{ borderTop: "1px solid #FEE2E2" }}>
            <Group justify="space-between" align="center">
              <Text size="xs" c="#6B7280">
                Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} invoices
              </Text>
              <Pagination
                total={pagination.totalPages}
                value={page}
                onChange={setPage}
                size="sm"
                radius="md"
                color="pink"
              />
            </Group>
          </Box>
        )}
      </Paper>

      {/* Invoice Snapshot Details Modal */}
      <Modal
        opened={detailModalOpened}
        onClose={() => setDetailModalOpened(false)}
        title={
          <Group gap="xs">
            <ThemeIcon size={28} radius="sm" variant="light" color="pink">
              <IconReceipt size={16} />
            </ThemeIcon>
            <Box>
              <Text fw={700} size="sm" c="#1F2937">
                Invoice Breakdown: {selectedInvoice?.invoiceNumber}
              </Text>
              <Text size="11px" c="#9CA3AF">
                Order Reference: {selectedInvoice?.orderNumber || selectedInvoice?.orderId}
              </Text>
            </Box>
          </Group>
        }
        size="lg"
        radius="md"
        padding="lg"
      >
        {selectedInvoice && (
          <Stack gap="md">
            {/* Customer & Billing Info */}
            <Card withBorder radius="md" p="sm" style={{ backgroundColor: "#FFF8F6", borderColor: "#FEE2E2" }}>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Box>
                  <Group gap={6} mb={4}>
                    <IconUser size={14} color="#FF6B8B" />
                    <Text size="xs" fw={700} c="#1F2937">
                      Customer Information
                    </Text>
                  </Group>
                  <Text size="xs" fw={600} c="#374151">
                    {selectedInvoice.customerName}
                  </Text>
                  <Text size="xs" c="#6B7280">
                    Phone: {selectedInvoice.customerPhone}
                  </Text>
                </Box>

                <Box>
                  <Group gap={6} mb={4}>
                    <IconMapPin size={14} color="#FF6B8B" />
                    <Text size="xs" fw={700} c="#1F2937">
                      Shipping / Delivery Address
                    </Text>
                  </Group>
                  <Text size="xs" c="#4B5563">
                    {selectedInvoice.customerAddress || "Standard Delivery"}
                  </Text>
                </Box>
              </SimpleGrid>
            </Card>

            {/* Line Items Snapshot */}
            <Box>
              <Text size="xs" fw={700} c="#4B5563" mb="xs" style={{ textTransform: "uppercase" }}>
                Purchased Items & Batch Allocation
              </Text>
              <Paper withBorder radius="sm" style={{ overflow: "hidden" }}>
                <Table verticalSpacing="xs" horizontalSpacing="sm">
                  <Table.Thead style={{ backgroundColor: "#F9FAFB" }}>
                    <Table.Tr>
                      <Table.Th style={{ fontSize: "11px", color: "#6B7280" }}>ITEM / SKU</Table.Th>
                      <Table.Th style={{ fontSize: "11px", color: "#6B7280" }}>BATCH & EXPIRY</Table.Th>
                      <Table.Th style={{ fontSize: "11px", color: "#6B7280", textAlign: "center" }}>QTY</Table.Th>
                      <Table.Th style={{ fontSize: "11px", color: "#6B7280", textAlign: "right" }}>UNIT PRICE</Table.Th>
                      <Table.Th style={{ fontSize: "11px", color: "#6B7280", textAlign: "right" }}>TOTAL</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedInvoice.itemsSnapshot?.map((item, idx) => (
                      <Table.Tr key={item.id || idx}>
                        <Table.Td>
                          <Text size="xs" fw={600} c="#1F2937">
                            {item.title}
                          </Text>
                          {item.sku && (
                            <Text size="10px" c="#9CA3AF">
                              SKU: {item.sku}
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td>
                          {item.batchNumber ? (
                            <Group gap={4}>
                              <Badge size="xs" variant="light" color="pink" radius="xs">
                                {item.batchNumber}
                              </Badge>
                              {item.expiryDate && (
                                <Text size="10px" c="#6B7280">
                                  Exp: {item.expiryDate}
                                </Text>
                              )}
                            </Group>
                          ) : (
                            <Text size="11px" c="#9CA3AF">
                              Standard
                            </Text>
                          )}
                        </Table.Td>
                        <Table.Td style={{ textAlign: "center" }}>
                          <Text size="xs" fw={600} c="#1F2937">
                            {item.quantity}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="xs" c="#4B5563">
                            ৳{parseFloat(item.unitPrice).toFixed(2)}
                          </Text>
                        </Table.Td>
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text size="xs" fw={700} c="#1F2937">
                            ৳{parseFloat(item.totalPrice).toFixed(2)}
                          </Text>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Paper>
            </Box>

            {/* Financial Totals */}
            <Paper withBorder radius="md" p="sm" style={{ backgroundColor: "#F9FAFB" }}>
              <Stack gap={6}>
                <Group justify="space-between">
                  <Text size="xs" c="#6B7280">
                    Subtotal:
                  </Text>
                  <Text size="xs" fw={600} c="#374151">
                    ৳{parseFloat(selectedInvoice.subtotal).toFixed(2)}
                  </Text>
                </Group>
                <Group justify="space-between">
                  <Text size="xs" c="#6B7280">
                    Delivery Fee:
                  </Text>
                  <Text size="xs" fw={600} c="#374151">
                    ৳{parseFloat(selectedInvoice.deliveryFee).toFixed(2)}
                  </Text>
                </Group>
                {parseFloat(selectedInvoice.discountAmount) > 0 && (
                  <Group justify="space-between">
                    <Text size="xs" c="green">
                      Coupon Discount:
                    </Text>
                    <Text size="xs" fw={600} c="green">
                      -৳{parseFloat(selectedInvoice.discountAmount).toFixed(2)}
                    </Text>
                  </Group>
                )}
                <Divider my={2} />
                <Group justify="space-between">
                  <Text size="sm" fw={750} c="#1F2937">
                    Grand Total:
                  </Text>
                  <Text size="md" fw={800} c="#FF6B8B">
                    ৳{parseFloat(selectedInvoice.totalAmount).toFixed(2)}
                  </Text>
                </Group>
              </Stack>
            </Paper>

            {/* Actions in Modal */}
            <Group justify="flex-end" gap="sm" mt="xs">
              <Button
                variant="light"
                color="pink"
                size="sm"
                radius="md"
                leftSection={<IconExternalLink size={16} />}
                onClick={() => handleViewPdf(selectedInvoice)}
              >
                View PDF
              </Button>

              <Button
                variant="filled"
                style={{ backgroundColor: "#FF6B8B" }}
                size="sm"
                radius="md"
                leftSection={<IconDownload size={16} />}
                onClick={() => handleDownloadPdf(selectedInvoice)}
              >
                Download PDF
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
