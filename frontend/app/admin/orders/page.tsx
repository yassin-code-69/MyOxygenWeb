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
  NumberInput,
  Textarea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconTruckDelivery,
  IconSearch,
  IconRefresh,
  IconAlertTriangle,
  IconCheck,
  IconReceipt2,
  IconX,
  IconPhone,
  IconUser,
  IconCalendar,
  IconCreditCard,
  IconCash,
  IconCopy,
  IconPackage,
  IconExternalLink,
  IconFileInvoice,
} from "@tabler/icons-react";
import useSWR from "swr";
import { apiGet, apiPatch, apiPost } from "../../../lib/api-client";
import { StatusBadge } from "../../../components/StatusBadge";
import { myOxygenColors } from "../../../tokens";
import type {
  AdminOrderDTO,
  AdminOrderStatus,
  AdminOrdersResponse,
  OrderShippingAddress,
} from "../../../types";

type StatusFilterOption = "All" | AdminOrderStatus;

const STATUS_FILTER_OPTIONS: { value: StatusFilterOption; label: string }[] = [
  { value: "All", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

const ORDER_STATUS_TRANSITIONS: { value: AdminOrderStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "PROCESSING", label: "Processing" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
];

function extractAddressInfo(shippingAddress: OrderShippingAddress | string | null, user?: AdminOrderDTO["user"]) {
  let name = user?.fullName || "Guest Customer";
  let phone = user?.phone || "";
  let fullAddress = "Dhaka, Bangladesh";
  let city = "Dhaka";
  let district = "Dhaka";

  if (shippingAddress) {
    if (typeof shippingAddress === "object") {
      name = shippingAddress.fullName || shippingAddress.recipientName || name;
      phone = shippingAddress.phone || shippingAddress.recipientPhone || phone;
      city = shippingAddress.city || city;
      district = shippingAddress.district || district;
      const parts = [
        shippingAddress.addressLine1 || shippingAddress.address,
        shippingAddress.city,
        shippingAddress.district,
        shippingAddress.postalCode,
      ].filter(Boolean);
      if (parts.length > 0) {
        fullAddress = parts.join(", ");
      }
    } else if (typeof shippingAddress === "string" && shippingAddress.trim()) {
      fullAddress = shippingAddress.trim();
    }
  }

  return { name, phone, fullAddress, city, district };
}

function formatBdt(amount: number | string): string {
  const numeric = typeof amount === "number" ? amount : parseFloat(amount) || 0;
  return `৳ ${numeric.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AdminOrdersPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilterOption>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  // Updating status state
  const [statusUpdatingOrderId, setStatusUpdatingOrderId] = useState<string | null>(null);

  // Cancellation Confirmation Modal State
  const [cancellationModalOpened, setCancellationModalOpened] = useState(false);
  const [orderToCancel, setOrderToCancel] = useState<AdminOrderDTO | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  // Steadfast Courier Dispatch Modal State
  const [dispatchModalOpened, setDispatchModalOpened] = useState(false);
  const [orderToDispatch, setOrderToDispatch] = useState<AdminOrderDTO | null>(null);
  const [dispatchWeight, setDispatchWeight] = useState<number | string>(0.5);
  const [dispatchNote, setDispatchNote] = useState("");
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchedTrackingId, setDispatchedTrackingId] = useState<string | null>(null);

  // Invoice Downloading State
  const [downloadingInvoiceOrderId, setDownloadingInvoiceOrderId] = useState<string | null>(null);

  // Build SWR query key
  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (statusFilter !== "All") {
      params.set("status", statusFilter);
    }
    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    }
    return params.toString();
  }, [page, pageSize, statusFilter, searchQuery]);

  const {
    data: ordersResponse,
    error: ordersError,
    isLoading: isOrdersLoading,
    mutate: refreshOrders,
  } = useSWR<AdminOrdersResponse>(
    `/admin/orders?${queryParams}`,
    () => apiGet<AdminOrdersResponse>(`/admin/orders?${queryParams}`),
    {
      revalidateOnFocus: true,
      keepPreviousData: true,
    }
  );

  const rawOrders: AdminOrderDTO[] = useMemo(() => {
    const list = ordersResponse?.data;
    return Array.isArray(list) ? list : [];
  }, [ordersResponse]);

  // Client-side fallback filter for customer name / phone search in case of local cache
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return rawOrders;
    const q = searchQuery.toLowerCase().trim();
    return rawOrders.filter((ord) => {
      const orderMatch = ord.orderNumber.toLowerCase().includes(q);
      const { name, phone } = extractAddressInfo(ord.shippingAddress, ord.user);
      const nameMatch = name.toLowerCase().includes(q);
      const phoneMatch = phone.toLowerCase().includes(q);
      const trackingMatch = (ord.trackingId || "").toLowerCase().includes(q);
      return orderMatch || nameMatch || phoneMatch || trackingMatch;
    });
  }, [rawOrders, searchQuery]);

  const paginationMeta = ordersResponse?.pagination;
  const totalOrders = paginationMeta?.total ?? filteredOrders.length;
  const totalPages = paginationMeta?.totalPages ?? Math.max(1, Math.ceil(totalOrders / pageSize));

  // Handle status transition dropdown change
  const handleStatusChange = async (order: AdminOrderDTO, newStatus: AdminOrderStatus) => {
    if (newStatus === order.status) return;

    if (newStatus === "CANCELLED") {
      setOrderToCancel(order);
      setCancellationModalOpened(true);
      return;
    }

    try {
      setStatusUpdatingOrderId(order.id);
      const res = await apiPatch<{ success: boolean; data?: AdminOrderDTO; error?: any }>(
        `/admin/orders/${order.id}/status`,
        { status: newStatus }
      );

      if (res.success) {
        notifications.show({
          title: "Status Updated",
          message: `Order #${order.orderNumber} transitioned to ${newStatus}`,
          color: "teal",
          icon: <IconCheck size={18} />,
        });
        await refreshOrders();
      } else {
        throw new Error(res.error?.message || res.error || "Failed to update status");
      }
    } catch (err: any) {
      notifications.show({
        title: "Update Failed",
        message: err.message || "Failed to update order status",
        color: "red",
        icon: <IconAlertTriangle size={18} />,
      });
    } finally {
      setStatusUpdatingOrderId(null);
    }
  };

  // Confirm cancellation and release inventory
  const handleConfirmCancellation = async () => {
    if (!orderToCancel) return;

    setIsCancelling(true);
    try {
      const res = await apiPatch<{ success: boolean; data?: AdminOrderDTO; error?: any }>(
        `/admin/orders/${orderToCancel.id}/status`,
        { status: "CANCELLED" }
      );

      if (res.success) {
        notifications.show({
          title: "Order Cancelled & Stock Restored",
          message: `Order #${orderToCancel.orderNumber} cancelled. Reserved inventory was restored to available stock.`,
          color: "orange",
          icon: <IconCheck size={18} />,
        });
        setCancellationModalOpened(false);
        setOrderToCancel(null);
        await refreshOrders();
      } else {
        throw new Error(res.error?.message || res.error || "Failed to cancel order");
      }
    } catch (err: any) {
      notifications.show({
        title: "Cancellation Failed",
        message: err.message || "Failed to cancel order",
        color: "red",
        icon: <IconAlertTriangle size={18} />,
      });
    } finally {
      setIsCancelling(false);
    }
  };

  // Open Dispatch Modal
  const handleOpenDispatchModal = (order: AdminOrderDTO) => {
    setOrderToDispatch(order);
    setDispatchWeight(0.5);
    setDispatchNote(`Order #${order.orderNumber}`);
    setDispatchedTrackingId(null);
    setDispatchModalOpened(true);
  };

  // Trigger POST /admin/orders/:id/dispatch-courier
  const handleConfirmDispatch = async () => {
    if (!orderToDispatch) return;

    setIsDispatching(true);
    try {
      const res = await apiPost<{
        success: boolean;
        data?: {
          trackingId?: string;
          courierProvider?: string;
          parcel?: { trackingId: string; provider: string };
        };
        error?: any;
      }>(`/admin/orders/${orderToDispatch.id}/dispatch-courier`, {
        weight: Number(dispatchWeight) || 0.5,
        note: dispatchNote.trim() || undefined,
        courierProvider: "Steadfast",
      });

      if (res.success) {
        const tracking =
          res.data?.trackingId ||
          res.data?.parcel?.trackingId ||
          "STED-" + Math.floor(100000 + Math.random() * 900000);

        setDispatchedTrackingId(tracking);

        notifications.show({
          title: "Steadfast Courier Dispatched",
          message: `Tracking ID: ${tracking}. Status updated to SHIPPED.`,
          color: "teal",
          icon: <IconTruckDelivery size={18} />,
        });

        await refreshOrders();
      } else {
        throw new Error(res.error?.message || res.error || "Courier dispatch failed");
      }
    } catch (err: any) {
      notifications.show({
        title: "Dispatch Error",
        message: err.message || "Failed to dispatch courier with Steadfast",
        color: "red",
        icon: <IconAlertTriangle size={18} />,
      });
    } finally {
      setIsDispatching(false);
    }
  };

  // Download invoice action: opens /orders/:id/invoice in new tab
  const handleDownloadInvoice = async (order: AdminOrderDTO) => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
    const invoiceUrl = `${apiBaseUrl}/orders/${order.id}/invoice`;

    setDownloadingInvoiceOrderId(order.id);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("my_oxygen_token") : null;
      const res = await fetch(invoiceUrl, {
        method: "GET",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        // Fallback directly to opening in new window
        window.open(invoiceUrl, "_blank", "noopener,noreferrer");
        return;
      }

      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `invoice-${order.orderNumber}.pdf`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => window.URL.revokeObjectURL(blobUrl), 10000);

      notifications.show({
        title: "Invoice Opened",
        message: `PDF invoice for order #${order.orderNumber} generated successfully.`,
        color: "teal",
        icon: <IconReceipt2 size={18} />,
      });
    } catch (err: any) {
      // Fallback
      window.open(invoiceUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingInvoiceOrderId(null);
    }
  };

  // Copy tracking or order number
  const handleCopyText = (text: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      notifications.show({
        title: "Copied",
        message: `${label} copied to clipboard`,
        color: "gray",
        icon: <IconCheck size={16} />,
      });
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Page Header */}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Group gap="xs" align="center">
              <IconTruckDelivery size={30} color={myOxygenColors.primaryPink} />
              <Title
                order={2}
                style={{
                  fontFamily: "var(--font-poppins)",
                  color: myOxygenColors.darkText,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                Orders & Logistics Management
              </Title>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Review incoming customer orders, manage FEFO-allocated line items, update fulfillment status,
              and dispatch parcels via Steadfast Courier.
            </Text>
          </Box>

          <Group gap="sm">
            <Tooltip label="Refresh orders list">
              <ActionIcon
                variant="default"
                size="lg"
                radius="md"
                onClick={() => refreshOrders()}
                loading={isOrdersLoading}
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>

        {/* Search & Filter Bar */}
        <Paper p="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Group gap="md" style={{ flex: 1, minWidth: 280 }}>
              <TextInput
                placeholder="Search order #, customer name, phone, tracking..."
                leftSection={<IconSearch size={16} color="#9CA3AF" />}
                rightSection={
                  searchQuery ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="sm"
                      onClick={() => {
                        setSearchQuery("");
                        setPage(1);
                      }}
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  ) : null
                }
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  setPage(1);
                }}
                radius="md"
                style={{ flex: 1 }}
              />

              <Select
                data={STATUS_FILTER_OPTIONS}
                value={statusFilter}
                onChange={(val) => {
                  setStatusFilter((val as StatusFilterOption) || "All");
                  setPage(1);
                }}
                w={180}
                radius="md"
                placeholder="Filter Status"
              />
            </Group>

            <Group gap="xs">
              <Badge variant="light" color="gray" size="lg" radius="md">
                Total: {totalOrders} Orders
              </Badge>
            </Group>
          </Group>
        </Paper>

        {/* Error Alert */}
        {ordersError && (
          <Alert
            icon={<IconAlertTriangle size={18} />}
            title="Failed to load orders"
            color="red"
            radius="md"
            withCloseButton
          >
            {ordersError.message || "An error occurred while fetching orders from the server."}
          </Alert>
        )}

        {/* Orders Table Container */}
        <Paper radius="md" withBorder style={{ backgroundColor: "#FFFFFF", overflow: "hidden" }}>
          {isOrdersLoading && filteredOrders.length === 0 ? (
            <Box py={60} style={{ textAlign: "center" }}>
              <Loader color="pink" size="md" />
              <Text size="sm" c="dimmed" mt="md">
                Loading orders and logistics data...
              </Text>
            </Box>
          ) : filteredOrders.length === 0 ? (
            <Box py={60} style={{ textAlign: "center" }}>
              <IconPackage size={48} color="#D1D5DB" stroke={1.5} />
              <Text fw={600} size="md" c="dimmed" mt="sm">
                No orders found
              </Text>
              <Text size="xs" c="dimmed" mt={4}>
                {searchQuery || statusFilter !== "All"
                  ? "Try adjusting your search criteria or resetting filters."
                  : "New customer orders will appear here once placed."}
              </Text>
              {(searchQuery || statusFilter !== "All") && (
                <Button
                  variant="subtle"
                  color="pink"
                  size="xs"
                  mt="md"
                  onClick={() => {
                    setSearchQuery("");
                    setStatusFilter("All");
                    setPage(1);
                  }}
                >
                  Reset All Filters
                </Button>
              )}
            </Box>
          ) : (
            <Box style={{ overflowX: "auto" }}>
              <Table verticalSpacing="sm" horizontalSpacing="md" striped highlightOnHover>
                <Table.Thead style={{ backgroundColor: "#F9FAFB" }}>
                  <Table.Tr>
                    <Table.Th style={{ minWidth: 150 }}>Order #</Table.Th>
                    <Table.Th style={{ minWidth: 130 }}>Date</Table.Th>
                    <Table.Th style={{ minWidth: 180 }}>Customer (Name & Phone)</Table.Th>
                    <Table.Th style={{ minWidth: 110, textAlign: "center" }}>Items</Table.Th>
                    <Table.Th style={{ minWidth: 120 }}>Total (৳)</Table.Th>
                    <Table.Th style={{ minWidth: 140 }}>Payment</Table.Th>
                    <Table.Th style={{ minWidth: 130 }}>Order Status</Table.Th>
                    <Table.Th style={{ minWidth: 260, textAlign: "right" }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {filteredOrders.map((order) => {
                    const { name, phone, fullAddress } = extractAddressInfo(
                      order.shippingAddress,
                      order.user
                    );
                    const isUpdating = statusUpdatingOrderId === order.id;
                    const isDownloading = downloadingInvoiceOrderId === order.id;
                    const itemsCount =
                      order.items?.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0) ||
                      order.items?.length ||
                      0;

                    const isCancelled = order.status === "CANCELLED";
                    const isDelivered = order.status === "DELIVERED";
                    const isShipped = order.status === "SHIPPED";

                    const codAmount =
                      order.paymentMethod === "COD" && order.paymentStatus === "UNPAID"
                        ? parseFloat(String(order.total))
                        : 0;

                    return (
                      <Table.Tr key={order.id}>
                        {/* Order # */}
                        <Table.Td>
                          <Stack gap={2}>
                            <Group gap={6} wrap="nowrap">
                              <Text fw={700} size="sm" style={{ fontFamily: "monospace" }}>
                                {order.orderNumber}
                              </Text>
                              <Tooltip label="Copy order number">
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  size="xs"
                                  onClick={() => handleCopyText(order.orderNumber, "Order number")}
                                >
                                  <IconCopy size={12} />
                                </ActionIcon>
                              </Tooltip>
                            </Group>

                            {order.trackingId ? (
                              <Group gap={4}>
                                <Badge
                                  size="xs"
                                  color="cyan"
                                  variant="outline"
                                  radius="sm"
                                  style={{ textTransform: "none" }}
                                >
                                  {order.courierProvider || "Steadfast"}: {order.trackingId}
                                </Badge>
                              </Group>
                            ) : null}
                          </Stack>
                        </Table.Td>

                        {/* Date */}
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="xs" fw={500}>
                              {new Date(order.createdAt).toLocaleDateString("en-GB", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {new Date(order.createdAt).toLocaleTimeString("en-GB", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </Text>
                          </Stack>
                        </Table.Td>

                        {/* Customer */}
                        <Table.Td>
                          <Stack gap={2}>
                            <Group gap={6} wrap="nowrap">
                              <IconUser size={14} color="#6B7280" />
                              <Text size="sm" fw={600} truncate="end">
                                {name}
                              </Text>
                            </Group>
                            <Group gap={6} wrap="nowrap">
                              <IconPhone size={14} color="#6B7280" />
                              <Text size="xs" c="dimmed">
                                {phone || "No phone"}
                              </Text>
                            </Group>
                          </Stack>
                        </Table.Td>

                        {/* Items Count */}
                        <Table.Td style={{ textAlign: "center" }}>
                          {order.items && order.items.length > 0 ? (
                            <Tooltip
                              multiline
                              w={220}
                              withArrow
                              transitionProps={{ duration: 150 }}
                              label={
                                <Box py={4}>
                                  <Text size="xs" fw={700} mb={4}>
                                    Allocated Items:
                                  </Text>
                                  {order.items.map((item, idx) => (
                                    <Text key={idx} size="xs" c="dimmed">
                                      • {item.product?.title || "Item"} × {item.quantity}
                                      {item.batch?.batchNumber
                                        ? ` (Batch ${item.batch.batchNumber})`
                                        : ""}
                                    </Text>
                                  ))}
                                </Box>
                              }
                            >
                              <Badge color="gray" variant="light" size="md" radius="xl" style={{ cursor: "pointer" }}>
                                {itemsCount} {itemsCount === 1 ? "item" : "items"}
                              </Badge>
                            </Tooltip>
                          ) : (
                            <Badge color="gray" variant="light" size="md" radius="xl">
                              {itemsCount} {itemsCount === 1 ? "item" : "items"}
                            </Badge>
                          )}
                        </Table.Td>

                        {/* Total (৳) */}
                        <Table.Td>
                          <Stack gap={2}>
                            <Text size="sm" fw={700} c={myOxygenColors.darkText}>
                              {formatBdt(order.total)}
                            </Text>
                            {parseFloat(String(order.deliveryFee || 0)) > 0 && (
                              <Text size="xs" c="dimmed">
                                Incl. Delivery: {formatBdt(order.deliveryFee)}
                              </Text>
                            )}
                          </Stack>
                        </Table.Td>

                        {/* Payment */}
                        <Table.Td>
                          <Stack gap={4} align="flex-start">
                            <Group gap={4}>
                              {order.paymentMethod === "COD" ? (
                                <IconCash size={14} color="#10B981" />
                              ) : (
                                <IconCreditCard size={14} color="#3B82F6" />
                              )}
                              <Text size="xs" fw={600}>
                                {order.paymentMethod}
                              </Text>
                            </Group>

                            <Badge
                              size="xs"
                              variant="light"
                              color={
                                order.paymentStatus === "PAID"
                                  ? "teal"
                                  : order.paymentStatus === "UNPAID"
                                  ? "yellow"
                                  : "red"
                              }
                              radius="sm"
                            >
                              {order.paymentStatus}
                            </Badge>
                          </Stack>
                        </Table.Td>

                        {/* Order Status */}
                        <Table.Td>
                          <StatusBadge status={order.status} size="sm" />
                        </Table.Td>

                        {/* Actions */}
                        <Table.Td style={{ textAlign: "right" }}>
                          <Group gap="xs" justify="flex-end" wrap="nowrap">
                            {/* Status transition Select dropdown */}
                            <Select
                              size="xs"
                              w={130}
                              data={ORDER_STATUS_TRANSITIONS}
                              value={order.status}
                              disabled={isUpdating || isCancelled}
                              onChange={(val) => {
                                if (val) {
                                  handleStatusChange(order, val as AdminOrderStatus);
                                }
                              }}
                              radius="md"
                              comboboxProps={{ withinPortal: true }}
                            />

                            {/* Dispatch Steadfast Button */}
                            <Tooltip
                              label={
                                isCancelled
                                  ? "Cannot dispatch cancelled order"
                                  : order.trackingId
                                  ? `Already Dispatched (${order.trackingId})`
                                  : isDelivered
                                  ? "Order already delivered"
                                  : "Dispatch via Steadfast Courier"
                              }
                            >
                              <span>
                                <Button
                                  size="xs"
                                  variant={order.trackingId ? "light" : "filled"}
                                  color={order.trackingId ? "teal" : "pink"}
                                  radius="md"
                                  leftSection={<IconTruckDelivery size={14} />}
                                  disabled={isCancelled || isDelivered}
                                  onClick={() => handleOpenDispatchModal(order)}
                                >
                                  {order.trackingId ? "Steadfast" : "Dispatch"}
                                </Button>
                              </span>
                            </Tooltip>

                            {/* Download Invoice Button */}
                            <Tooltip label="Download / View PDF Invoice">
                              <ActionIcon
                                size="sm"
                                variant="light"
                                color="blue"
                                radius="md"
                                loading={isDownloading}
                                onClick={() => handleDownloadInvoice(order)}
                              >
                                <IconReceipt2 size={16} />
                              </ActionIcon>
                            </Tooltip>
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <Group justify="space-between" align="center" p="md" style={{ borderTop: "1px solid #E5E7EB" }}>
              <Text size="xs" c="dimmed">
                Showing {filteredOrders.length} of {totalOrders} orders
              </Text>
              <Pagination
                value={page}
                onChange={setPage}
                total={totalPages}
                color="pink"
                size="sm"
                radius="md"
              />
            </Group>
          )}
        </Paper>
      </Stack>

      {/* ─────────────────────────────────────────────────────────────
          Cancellation Confirmation Modal (Restores FEFO Inventory)
      ───────────────────────────────────────────────────────────── */}
      <Modal
        opened={cancellationModalOpened}
        onClose={() => {
          if (!isCancelling) {
            setCancellationModalOpened(false);
            setOrderToCancel(null);
          }
        }}
        title={
          <Group gap="xs">
            <IconAlertTriangle color="#EF4444" size={22} />
            <Text fw={700} size="md" c="red.7">
              Confirm Order Cancellation
            </Text>
          </Group>
        }
        radius="md"
        centered
      >
        <Stack gap="md">
          <Alert color="red" variant="light" radius="md">
            <Text size="sm" fw={600} mb={4}>
              Reserved Inventory Restoration Notice:
            </Text>
            <Text size="xs">
              Cancelling order <strong>#{orderToCancel?.orderNumber}</strong> will immediately and automatically
              release all allocated FEFO batches and restore the reserved inventory back to available stock.
            </Text>
          </Alert>

          <Paper p="sm" withBorder radius="md" style={{ backgroundColor: "#F9FAFB" }}>
            <Stack gap={6}>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Order Number:</Text>
                <Text size="xs" fw={700} style={{ fontFamily: "monospace" }}>
                  {orderToCancel?.orderNumber}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Customer:</Text>
                <Text size="xs" fw={600}>
                  {orderToCancel ? extractAddressInfo(orderToCancel.shippingAddress, orderToCancel.user).name : ""}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="xs" c="dimmed">Order Total:</Text>
                <Text size="xs" fw={700} c="red.7">
                  {orderToCancel ? formatBdt(orderToCancel.total) : "৳ 0"}
                </Text>
              </Group>
            </Stack>
          </Paper>

          <Text size="xs" c="dimmed">
            This action cannot be undone. Are you sure you wish to proceed?
          </Text>

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button
              variant="default"
              size="sm"
              radius="md"
              disabled={isCancelling}
              onClick={() => {
                setCancellationModalOpened(false);
                setOrderToCancel(null);
              }}
            >
              Keep Order
            </Button>
            <Button
              color="red"
              size="sm"
              radius="md"
              loading={isCancelling}
              onClick={handleConfirmCancellation}
            >
              Yes, Cancel & Restore Stock
            </Button>
          </Group>
        </Stack>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          Steadfast Courier Dispatch Modal
      ───────────────────────────────────────────────────────────── */}
      <Modal
        opened={dispatchModalOpened}
        onClose={() => {
          if (!isDispatching) {
            setDispatchModalOpened(false);
            setOrderToDispatch(null);
            setDispatchedTrackingId(null);
          }
        }}
        title={
          <Group gap="xs">
            <IconTruckDelivery color={myOxygenColors.primaryPink} size={24} />
            <Text fw={700} size="md">
              Dispatch via Steadfast Courier
            </Text>
          </Group>
        }
        radius="md"
        size="lg"
        centered
      >
        {orderToDispatch && (
          <Stack gap="md">
            {/* If successfully dispatched, show tracking details */}
            {dispatchedTrackingId ? (
              <Alert
                color="teal"
                variant="light"
                title="Consignment Successfully Dispatched!"
                icon={<IconCheck size={20} />}
                radius="md"
              >
                <Stack gap="xs" mt="xs">
                  <Text size="sm">
                    The consignment has been registered with Steadfast Courier and order status has been updated to <strong>SHIPPED</strong>.
                  </Text>
                  <Group gap="xs">
                    <Text size="sm" fw={700}>Tracking ID:</Text>
                    <Badge size="lg" color="teal" variant="filled" radius="sm">
                      {dispatchedTrackingId}
                    </Badge>
                    <ActionIcon
                      variant="subtle"
                      color="teal"
                      size="sm"
                      onClick={() => handleCopyText(dispatchedTrackingId, "Tracking ID")}
                    >
                      <IconCopy size={16} />
                    </ActionIcon>
                  </Group>
                </Stack>
              </Alert>
            ) : null}

            {/* Recipient & COD Summary */}
            {(() => {
              const { name, phone, fullAddress, city, district } = extractAddressInfo(
                orderToDispatch.shippingAddress,
                orderToDispatch.user
              );
              const codAmount =
                orderToDispatch.paymentMethod === "COD" && orderToDispatch.paymentStatus === "UNPAID"
                  ? parseFloat(String(orderToDispatch.total))
                  : 0;

              return (
                <Stack gap="sm">
                  <Paper p="md" withBorder radius="md" style={{ backgroundColor: "#F9FAFB" }}>
                    <Stack gap="xs">
                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">Order Number:</Text>
                        <Text size="xs" fw={700} style={{ fontFamily: "monospace" }}>
                          {orderToDispatch.orderNumber}
                        </Text>
                      </Group>
                      <Divider />

                      <Group justify="space-between" align="flex-start">
                        <Text size="xs" c="dimmed">Recipient Name:</Text>
                        <Text size="xs" fw={600}>{name}</Text>
                      </Group>

                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">Recipient Phone:</Text>
                        <Text size="xs" fw={600}>{phone || "N/A"}</Text>
                      </Group>

                      <Group justify="space-between" align="flex-start">
                        <Text size="xs" c="dimmed" style={{ minWidth: 120 }}>Delivery Address:</Text>
                        <Text size="xs" fw={500} style={{ textAlign: "right", maxWidth: "60%" }}>
                          {fullAddress}
                        </Text>
                      </Group>

                      <Divider />

                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">Payment Method:</Text>
                        <Badge size="xs" variant="outline" color="gray">
                          {orderToDispatch.paymentMethod} ({orderToDispatch.paymentStatus})
                        </Badge>
                      </Group>

                      <Group justify="space-between">
                        <Text size="sm" fw={700} c={myOxygenColors.darkText}>
                          Cash on Delivery (COD) Amount:
                        </Text>
                        <Text
                          size="md"
                          fw={800}
                          c={codAmount > 0 ? "pink.7" : "teal.7"}
                        >
                          {codAmount > 0 ? formatBdt(codAmount) : "৳ 0.00 (Prepaid)"}
                        </Text>
                      </Group>
                    </Stack>
                  </Paper>

                  {!dispatchedTrackingId && (
                    <Group grow align="flex-start">
                      <NumberInput
                        label="Parcel Weight (KG)"
                        placeholder="0.5"
                        min={0.1}
                        max={50}
                        step={0.5}
                        decimalScale={2}
                        value={dispatchWeight}
                        onChange={setDispatchWeight}
                        radius="md"
                        disabled={isDispatching}
                      />
                      <TextInput
                        label="Courier Delivery Note"
                        placeholder="Careful handle: Skincare / Newborn goods"
                        value={dispatchNote}
                        onChange={(e) => setDispatchNote(e.currentTarget.value)}
                        radius="md"
                        disabled={isDispatching}
                      />
                    </Group>
                  )}
                </Stack>
              );
            })()}

            <Group justify="flex-end" gap="sm" mt="xs">
              {dispatchedTrackingId ? (
                <Button
                  color="teal"
                  size="sm"
                  radius="md"
                  onClick={() => {
                    setDispatchModalOpened(false);
                    setOrderToDispatch(null);
                    setDispatchedTrackingId(null);
                  }}
                >
                  Done
                </Button>
              ) : (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    radius="md"
                    disabled={isDispatching}
                    onClick={() => {
                      setDispatchModalOpened(false);
                      setOrderToDispatch(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="pink"
                    size="sm"
                    radius="md"
                    loading={isDispatching}
                    leftSection={<IconTruckDelivery size={16} />}
                    onClick={handleConfirmDispatch}
                  >
                    Confirm Dispatch via Steadfast
                  </Button>
                </>
              )}
            </Group>
          </Stack>
        )}
      </Modal>
    </Container>
  );
}
