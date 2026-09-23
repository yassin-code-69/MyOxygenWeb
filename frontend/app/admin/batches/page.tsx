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
  NumberInput,
  Modal,
  Box,
  Loader,
  Alert,
  ActionIcon,
  Tooltip,
  Card,
  SimpleGrid,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPackage,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconAlertTriangle,
  IconCheck,
  IconCalendar,
  IconBarcode,
  IconFileAlert,
  IconX,
} from "@tabler/icons-react";
import useSWR from "swr";
import { apiGet, apiPost } from "../../../lib/api-client";
import { myOxygenColors } from "../../../tokens";
import type { BatchHealthStatus, BatchItemDTO } from "../../../types";

type FilterStatus = "ALL" | "EXPIRED" | "EXPIRING_SOON" | "HEALTHY";

interface ProductOption {
  value: string;
  label: string;
  sku: string;
}

export default function BatchInspectorPage() {
  const [activeFilter, setActiveFilter] = useState<FilterStatus>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [modalOpened, setModalOpened] = useState(false);

  // Form State for Import New Batch Modal
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [batchNumber, setBatchNumber] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [initialQuantity, setInitialQuantity] = useState<number | string>(100);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Fetch batches from GET /admin/batches
  const {
    data: batchesResponse,
    error: batchesError,
    isLoading: isBatchesLoading,
    mutate: refreshBatches,
  } = useSWR<any>("/admin/batches", () => apiGet("/admin/batches"), {
    revalidateOnFocus: true,
  });

  // Fetch products for the Import New Batch modal product select
  const { data: productsResponse } = useSWR<any>(
    "/catalog/products?limit=100",
    () => apiGet("/catalog/products?limit=100"),
    { revalidateOnFocus: false }
  );

  // Format products for Select dropdown
  const productOptions: ProductOption[] = useMemo(() => {
    const list = productsResponse?.data || productsResponse || [];
    if (!Array.isArray(list)) {
      return [];
    }
    return list.map((p: any) => ({
      value: p.id,
      label: `${p.title} (${p.sku || "No SKU"})`,
      sku: p.sku || "",
    }));
  }, [productsResponse]);

  // Extract and enrich batch items
  const batches: BatchItemDTO[] = useMemo(() => {
    const rawList = batchesResponse?.data || batchesResponse || [];
    if (!Array.isArray(rawList)) {
      return [];
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return rawList.map((batch: any) => {
      let shelfLifeDays = batch.shelfLifeDays;
      let healthStatus: BatchHealthStatus = batch.healthStatus;

      if (shelfLifeDays === undefined || !healthStatus) {
        if (!batch.expiryDate) {
          shelfLifeDays = 0;
          healthStatus = "EXPIRED";
        } else {
          const expiry = new Date(batch.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          const diffTime = expiry.getTime() - today.getTime();
          shelfLifeDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (shelfLifeDays <= 0) {
            healthStatus = "EXPIRED";
          } else if (shelfLifeDays <= 30) {
            healthStatus = "EXPIRING_SOON";
          } else {
            healthStatus = "HEALTHY";
          }
        }
      }

      return {
        ...batch,
        shelfLifeDays,
        healthStatus,
      };
    });
  }, [batchesResponse]);

  // Filter counts
  const counts = useMemo(() => {
    const total = batches.length;
    const expired = batches.filter((b) => b.healthStatus === "EXPIRED").length;
    const expiringSoon = batches.filter((b) => b.healthStatus === "EXPIRING_SOON").length;
    const healthy = batches.filter((b) => b.healthStatus === "HEALTHY").length;
    return { total, expired, expiringSoon, healthy };
  }, [batches]);

  // Filtered & searched batches
  const filteredBatches = useMemo(() => {
    return batches.filter((b) => {
      // Status filter
      if (activeFilter !== "ALL" && b.healthStatus !== activeFilter) {
        return false;
      }

      // Text search filter
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase().trim();
        const productName = b.product?.title?.toLowerCase() || "";
        const sku = b.product?.sku?.toLowerCase() || "";
        const batchNum = b.batchNumber?.toLowerCase() || "";
        if (!productName.includes(q) && !sku.includes(q) && !batchNum.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [batches, activeFilter, searchQuery]);

  // Handle Form Submission for Importing a New Batch
  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errors: Record<string, string> = {};

    if (!selectedProductId) {
      errors.productId = "Please select a product";
    }
    if (!batchNumber || batchNumber.trim().length < 3) {
      errors.batchNumber = "Batch number must be at least 3 characters";
    }
    if (!expiryDate) {
      errors.expiryDate = "Expiry date is required";
    } else {
      const todayStr = new Date().toISOString().split("T")[0];
      if (expiryDate <= todayStr) {
        errors.expiryDate = "Expiry date must be in the future";
      }
    }
    if (manufactureDate && expiryDate && manufactureDate >= expiryDate) {
      errors.manufactureDate = "Manufacture date must be before expiry date";
    }
    const qty = Number(initialQuantity);
    if (!qty || qty <= 0 || !Number.isInteger(qty)) {
      errors.initialQuantity = "Quantity must be a positive whole number";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSubmitting(true);

    try {
      const payload = {
        productId: selectedProductId,
        batchNumber: batchNumber.trim(),
        manufactureDate: manufactureDate ? manufactureDate : undefined,
        expiryDate: expiryDate,
        initialQuantity: qty,
      };

      await apiPost("/inventory/batches", payload);

      notifications.show({
        title: "Batch Imported",
        message: `Batch ${batchNumber} was successfully imported into inventory.`,
        color: "green",
        icon: <IconCheck size={18} />,
      });

      // Reset modal form
      setSelectedProductId(null);
      setBatchNumber("");
      setManufactureDate("");
      setExpiryDate("");
      setInitialQuantity(100);
      setModalOpened(false);

      // Refresh batch list
      await refreshBatches();
    } catch (err: any) {
      const msg = err?.message || "Failed to import batch. Please try again.";
      notifications.show({
        title: "Import Error",
        message: msg,
        color: "red",
        icon: <IconAlertTriangle size={18} />,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Page Header */}
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          <Box>
            <Group gap="xs" align="center">
              <IconPackage size={28} color={myOxygenColors.primaryPink} />
              <Title
                order={2}
                style={{
                  fontFamily: "var(--font-poppins)",
                  color: myOxygenColors.darkText,
                  fontWeight: 700,
                  letterSpacing: "-0.01em",
                }}
              >
                Batch Inspector
              </Title>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Real-time First-Expired, First-Out (FEFO) batch tracking, shelf life monitoring & inventory health.
            </Text>
          </Box>

          <Group gap="sm">
            <Tooltip label="Refresh batch list">
              <ActionIcon
                variant="default"
                size="lg"
                radius="md"
                onClick={() => refreshBatches()}
                loading={isBatchesLoading}
              >
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>

            <Button
              color="pink"
              leftSection={<IconPlus size={18} />}
              radius="md"
              style={{
                backgroundColor: myOxygenColors.primaryPink,
                boxShadow: "0 2px 8px rgba(255, 107, 139, 0.3)",
              }}
              onClick={() => setModalOpened(true)}
            >
              Import New Batch
            </Button>
          </Group>
        </Group>

        {/* Quick KPI Summary Cards */}
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          <Card padding="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
            <Text size="xs" c="dimmed" fw={600} tt="uppercase">
              Total Batches
            </Text>
            <Text size="xl" fw={700} c={myOxygenColors.darkText} mt={4}>
              {counts.total}
            </Text>
          </Card>

          <Card padding="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
            <Group justify="space-between" align="center">
              <Text size="xs" c="green.8" fw={600} tt="uppercase">
                Healthy Batches
              </Text>
              <Badge color="green" variant="light" size="sm">
                &gt;30 Days
              </Badge>
            </Group>
            <Text size="xl" fw={700} c="green.7" mt={4}>
              {counts.healthy}
            </Text>
          </Card>

          <Card padding="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
            <Group justify="space-between" align="center">
              <Text size="xs" c="orange.8" fw={600} tt="uppercase">
                Expiring Soon
              </Text>
              <Badge color="orange" variant="light" size="sm">
                ≤30 Days
              </Badge>
            </Group>
            <Text size="xl" fw={700} c="orange.7" mt={4}>
              {counts.expiringSoon}
            </Text>
          </Card>

          <Card padding="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
            <Group justify="space-between" align="center">
              <Text size="xs" c="red.8" fw={600} tt="uppercase">
                Expired Batches
              </Text>
              <Badge color="red" variant="light" size="sm">
                Action Req.
              </Badge>
            </Group>
            <Text size="xl" fw={700} c="red.7" mt={4}>
              {counts.expired}
            </Text>
          </Card>
        </SimpleGrid>

        {/* Filter Pills and Search Bar */}
        <Paper p="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            {/* Filter Pills */}
            <Group gap="xs" wrap="wrap">
              <Button
                variant={activeFilter === "ALL" ? "filled" : "light"}
                color={activeFilter === "ALL" ? "pink" : "gray"}
                radius="xl"
                size="sm"
                onClick={() => setActiveFilter("ALL")}
                style={{
                  backgroundColor: activeFilter === "ALL" ? myOxygenColors.primaryPink : undefined,
                  fontWeight: activeFilter === "ALL" ? 700 : 500,
                }}
              >
                All ({counts.total})
              </Button>

              <Button
                variant={activeFilter === "EXPIRED" ? "filled" : "light"}
                color="red"
                radius="xl"
                size="sm"
                onClick={() => setActiveFilter("EXPIRED")}
                style={{
                  fontWeight: activeFilter === "EXPIRED" ? 700 : 500,
                }}
              >
                Expired ({counts.expired})
              </Button>

              <Button
                variant={activeFilter === "EXPIRING_SOON" ? "filled" : "light"}
                color="orange"
                radius="xl"
                size="sm"
                onClick={() => setActiveFilter("EXPIRING_SOON")}
                style={{
                  fontWeight: activeFilter === "EXPIRING_SOON" ? 700 : 500,
                }}
              >
                Expiring Soon (≤30 Days) ({counts.expiringSoon})
              </Button>

              <Button
                variant={activeFilter === "HEALTHY" ? "filled" : "light"}
                color="green"
                radius="xl"
                size="sm"
                onClick={() => setActiveFilter("HEALTHY")}
                style={{
                  fontWeight: activeFilter === "HEALTHY" ? 700 : 500,
                }}
              >
                Healthy ({counts.healthy})
              </Button>
            </Group>

            {/* Search Box */}
            <TextInput
              placeholder="Search product, SKU, or batch..."
              leftSection={<IconSearch size={16} />}
              rightSection={
                searchQuery ? (
                  <ActionIcon size="xs" variant="transparent" c="dimmed" onClick={() => setSearchQuery("")}>
                    <IconX size={14} />
                  </ActionIcon>
                ) : null
              }
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              size="sm"
              radius="md"
              style={{ minWidth: 260 }}
            />
          </Group>
        </Paper>

        {/* Batch Inspector Table Container */}
        <Paper radius="md" withBorder style={{ backgroundColor: "#FFFFFF", overflow: "hidden" }}>
          {isBatchesLoading && batches.length === 0 ? (
            <Box py={60} style={{ textAlign: "center" }}>
              <Loader color="pink" size="md" />
              <Text size="sm" c="dimmed" mt="sm">
                Loading batch inventory...
              </Text>
            </Box>
          ) : batchesError && batches.length === 0 ? (
            <Box p="xl">
              <Alert icon={<IconAlertTriangle size={18} />} title="Error Loading Batches" color="red">
                {batchesError?.message || "Could not retrieve batch list. Please ensure the backend service is reachable."}
                <Group mt="sm">
                  <Button size="xs" variant="outline" color="red" onClick={() => refreshBatches()}>
                    Try Again
                  </Button>
                </Group>
              </Alert>
            </Box>
          ) : filteredBatches.length === 0 ? (
            <Box py={60} px="md" style={{ textAlign: "center" }}>
              <IconFileAlert size={44} color="#9CA3AF" style={{ margin: "0 auto", strokeWidth: 1.5 }} />
              <Text fw={600} size="md" c={myOxygenColors.darkText} mt="md">
                No batches found
              </Text>
              <Text size="sm" c="dimmed" mt={4} maw={400} mx="auto">
                {searchQuery || activeFilter !== "ALL"
                  ? "No batches match your active search and filter criteria. Try clearing filters or searching for another term."
                  : "No product batches have been imported yet. Click 'Import New Batch' to register your first lot."}
              </Text>
              {(searchQuery || activeFilter !== "ALL") && (
                <Button
                  variant="subtle"
                  color="pink"
                  size="xs"
                  mt="sm"
                  onClick={() => {
                    setActiveFilter("ALL");
                    setSearchQuery("");
                  }}
                >
                  Clear Filters
                </Button>
              )}
            </Box>
          ) : (
            <Table.ScrollContainer minWidth={900}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead style={{ backgroundColor: "#F9FAFB" }}>
                  <Table.Tr>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Product Name
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      SKU
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Batch #
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Manufacture Date
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Expiry Date
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Shelf Life
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13, textAlign: "right" }}>
                      Available Qty
                    </Table.Th>
                    <Table.Th style={{ color: myOxygenColors.textGray, fontWeight: 650, fontSize: 13 }}>
                      Health Status
                    </Table.Th>
                  </Table.Tr>
                </Table.Thead>

                <Table.Tbody>
                  {filteredBatches.map((batch) => {
                    const days = batch.shelfLifeDays ?? 0;
                    const status = batch.healthStatus;

                    return (
                      <Table.Tr key={batch.id}>
                        {/* Product Name */}
                        <Table.Td>
                          <Text fw={600} size="sm" c={myOxygenColors.darkText}>
                            {batch.product?.title || "Unknown Product"}
                          </Text>
                        </Table.Td>

                        {/* SKU */}
                        <Table.Td>
                          <Badge variant="outline" color="gray" size="sm" radius="xs" style={{ fontFamily: "monospace" }}>
                            {batch.product?.sku || "—"}
                          </Badge>
                        </Table.Td>

                        {/* Batch # */}
                        <Table.Td>
                          <Group gap={6} align="center">
                            <IconBarcode size={16} color="#6B7280" />
                            <Text fw={650} size="sm" c={myOxygenColors.darkText} style={{ fontFamily: "monospace" }}>
                              {batch.batchNumber}
                            </Text>
                          </Group>
                        </Table.Td>

                        {/* Manufacture Date */}
                        <Table.Td>
                          <Text size="sm" c={batch.manufactureDate ? myOxygenColors.darkText : "dimmed"}>
                            {batch.manufactureDate || "—"}
                          </Text>
                        </Table.Td>

                        {/* Expiry Date */}
                        <Table.Td>
                          <Group gap={6} align="center">
                            <IconCalendar size={15} color={status === "EXPIRED" ? "#EF4444" : "#6B7280"} />
                            <Text
                              size="sm"
                              fw={status === "EXPIRED" ? 700 : 500}
                              c={status === "EXPIRED" ? "red.7" : status === "EXPIRING_SOON" ? "orange.7" : myOxygenColors.darkText}
                            >
                              {batch.expiryDate}
                            </Text>
                          </Group>
                        </Table.Td>

                        {/* Shelf Life (days remaining) */}
                        <Table.Td>
                          {status === "EXPIRED" ? (
                            <Text size="sm" fw={650} c="red.7">
                              0 days (Expired)
                            </Text>
                          ) : days === 1 ? (
                            <Text size="sm" fw={600} c="orange.8">
                              1 day left
                            </Text>
                          ) : (
                            <Text
                              size="sm"
                              fw={days <= 30 ? 650 : 500}
                              c={days <= 30 ? "orange.8" : "green.8"}
                            >
                              {days} days remaining
                            </Text>
                          )}
                        </Table.Td>

                        {/* Available Qty */}
                        <Table.Td style={{ textAlign: "right" }}>
                          <Text
                            fw={700}
                            size="sm"
                            c={batch.availableQuantity === 0 ? "red.7" : myOxygenColors.darkText}
                          >
                            {batch.availableQuantity.toLocaleString()}
                          </Text>
                        </Table.Td>

                        {/* Health Status badge */}
                        <Table.Td>
                          {status === "EXPIRED" && (
                            <Badge color="red" variant="filled" size="sm" radius="md" fw={700}>
                              EXPIRED
                            </Badge>
                          )}
                          {status === "EXPIRING_SOON" && (
                            <Badge color="orange" variant="filled" size="sm" radius="md" fw={700}>
                              EXPIRING_SOON
                            </Badge>
                          )}
                          {status === "HEALTHY" && (
                            <Badge color="green" variant="filled" size="sm" radius="md" fw={700}>
                              HEALTHY
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

          {/* Footer count indicator */}
          <Box p="md" style={{ borderTop: "1px solid #F3F4F6", backgroundColor: "#FAFBFB" }}>
            <Text size="xs" c="dimmed">
              Showing {filteredBatches.length} of {batches.length} total batches
            </Text>
          </Box>
        </Paper>
      </Stack>

      {/* "Import New Batch" Modal */}
      <Modal
        opened={modalOpened}
        onClose={() => {
          if (!isSubmitting) {
            setModalOpened(false);
            setFormErrors({});
          }
        }}
        title={
          <Group gap="xs">
            <IconPackage size={22} color={myOxygenColors.primaryPink} />
            <Text fw={700} size="md" c={myOxygenColors.darkText}>
              Import New Batch
            </Text>
          </Group>
        }
        centered
        size="lg"
        radius="md"
        padding="lg"
      >
        <form onSubmit={handleImportSubmit}>
          <Stack gap="md">
            <Text size="xs" c="dimmed">
              Record a newly received shipment lot. The batch will be strictly queued for FIFO/FEFO allocation during customer checkout.
            </Text>

            {/* Product Select */}
            <Select
              label="Product"
              placeholder="Search and select product"
              data={productOptions}
              value={selectedProductId}
              onChange={(val) => {
                setSelectedProductId(val);
                if (formErrors.productId) {
                  setFormErrors((prev) => ({ ...prev, productId: "" }));
                }
              }}
              searchable
              clearable
              required
              nothingFoundMessage="No products found"
              error={formErrors.productId}
              disabled={isSubmitting}
            />

            {/* Batch Number */}
            <TextInput
              label="Batch Number"
              placeholder="e.g. BATCH-2026-001 or LOT-OCT26-A"
              value={batchNumber}
              onChange={(e) => {
                setBatchNumber(e.target.value);
                if (formErrors.batchNumber) {
                  setFormErrors((prev) => ({ ...prev, batchNumber: "" }));
                }
              }}
              required
              error={formErrors.batchNumber}
              disabled={isSubmitting}
            />

            {/* Dates: Manufacture & Expiry */}
            <Group grow align="flex-start">
              <TextInput
                type="date"
                label="Manufacture Date"
                value={manufactureDate}
                onChange={(e) => {
                  setManufactureDate(e.target.value);
                  if (formErrors.manufactureDate) {
                    setFormErrors((prev) => ({ ...prev, manufactureDate: "" }));
                  }
                }}
                error={formErrors.manufactureDate}
                disabled={isSubmitting}
                description="Optional: Date lot was produced"
              />

              <TextInput
                type="date"
                label="Expiry Date"
                value={expiryDate}
                onChange={(e) => {
                  setExpiryDate(e.target.value);
                  if (formErrors.expiryDate) {
                    setFormErrors((prev) => ({ ...prev, expiryDate: "" }));
                  }
                }}
                required
                error={formErrors.expiryDate}
                disabled={isSubmitting}
                description="Mandatory: Must be in future"
              />
            </Group>

            {/* Initial Quantity */}
            <NumberInput
              label="Initial Quantity"
              placeholder="e.g. 100"
              value={initialQuantity}
              onChange={(val) => {
                setInitialQuantity(val);
                if (formErrors.initialQuantity) {
                  setFormErrors((prev) => ({ ...prev, initialQuantity: "" }));
                }
              }}
              min={1}
              step={1}
              required
              error={formErrors.initialQuantity}
              disabled={isSubmitting}
              description="Quantity of units received in this batch"
            />

            {/* Action Buttons */}
            <Group justify="flex-end" mt="md" gap="sm">
              <Button
                variant="default"
                radius="md"
                onClick={() => setModalOpened(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="pink"
                radius="md"
                loading={isSubmitting}
                style={{
                  backgroundColor: myOxygenColors.primaryPink,
                }}
              >
                Save & Import Batch
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </Container>
  );
}
