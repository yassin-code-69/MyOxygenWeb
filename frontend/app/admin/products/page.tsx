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
  Switch,
  Textarea,
  Image,
  SegmentedControl,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconPackage,
  IconPlus,
  IconSearch,
  IconRefresh,
  IconAlertTriangle,
  IconEdit,
  IconTrash,
  IconBolt,
  IconCheck,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react";
import useSWR from "swr";
import { apiGet, apiPost, apiPatch, apiDelete } from "../../../lib/api-client";
import { myOxygenColors } from "../../../tokens";
import type { CatalogProductItem, CatalogProductsResponse } from "../../../types";

interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export default function AdminProductsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [productModalOpened, setProductModalOpened] = useState(false);
  const [flashSaleModalOpened, setFlashSaleModalOpened] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);

  // Edit / Delete Target
  const [editingProduct, setEditingProduct] = useState<CatalogProductItem | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<CatalogProductItem | null>(null);

  // Dynamic Categories from Backend
  const { data: categoriesResponse } = useSWR<{ success: boolean; data: CategoryOption[] }>(
    "/catalog/categories",
    apiGet,
    { revalidateOnFocus: false },
  );

  const categoryOptions = useMemo(() => {
    const rawCats = categoriesResponse?.data || [];
    if (rawCats.length > 0) {
      return rawCats.map((c) => ({ value: c.id, label: c.name, slug: c.slug }));
    }
    return [
      { value: "04edc8e7-b59f-4fa5-a850-215101e82f9e", label: "Skin Care", slug: "skin-care" },
      { value: "7e0995d3-5d99-4c89-861a-beeb78af8a79", label: "Mother Care", slug: "mother-care" },
      { value: "97958a2c-6bd9-4f6a-b4fc-a161c9383c55", label: "Newborn", slug: "newborn" },
      { value: "9c95d47b-a6fb-410c-9918-4a2759eb53a6", label: "Inner Wear", slug: "inner-wear" },
    ];
  }, [categoriesResponse]);

  // Product Form State
  const [formTitle, setFormTitle] = useState("");
  const [formSlug, setFormSlug] = useState("");
  const [formSku, setFormSku] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategoryId, setFormCategoryId] = useState<string | null>(null);
  const [formBasePrice, setFormBasePrice] = useState<number | string>(850);
  const [formCostPrice, setFormCostPrice] = useState<number | string>(550);
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formRequiresBatch, setFormRequiresBatch] = useState(true);
  const [formLowStockThreshold, setFormLowStockThreshold] = useState<number | string>(10);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Flash Sale Form State
  const [saleProductId, setSaleProductId] = useState<string | null>(null);
  const [saleDiscountType, setSaleDiscountType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">("PERCENTAGE");
  const [saleDiscountValue, setSaleDiscountValue] = useState<number | string>(15);
  const [saleEndsAt, setSaleEndsAt] = useState("");
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);

  // Fetch products from GET /catalog/products (with includeInactive=true for full admin visibility)
  const categoryFilter = selectedCategory && selectedCategory !== "all" ? `&categorySlug=${selectedCategory}` : "";
  const searchFilter = searchQuery.trim() ? `&q=${encodeURIComponent(searchQuery.trim())}` : "";
  const queryUrl = `/catalog/products?limit=100&includeInactive=true${categoryFilter}${searchFilter}`;

  const { data: response, error, isLoading, mutate } = useSWR<CatalogProductsResponse>(
    queryUrl,
    apiGet,
    { keepPreviousData: true },
  );

  const rawProducts = useMemo(() => response?.data || [], [response]);

  // Client-side status filtering
  const products = useMemo(() => {
    if (statusFilter === "active") {
      return rawProducts.filter((p) => p.isActive !== false);
    }
    if (statusFilter === "inactive") {
      return rawProducts.filter((p) => p.isActive === false);
    }
    return rawProducts;
  }, [rawProducts, statusFilter]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormTitle("");
    setFormSlug("");
    setFormSku(`SKU-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormDescription("Quality mother and baby care product.");
    setFormCategoryId(categoryOptions[0]?.value || "skin-care");
    setFormBasePrice(850);
    setFormCostPrice(550);
    setFormImageUrl("https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=60");
    setFormRequiresBatch(true);
    setFormLowStockThreshold(10);
    setProductModalOpened(true);
  };

  const openEditModal = (p: CatalogProductItem) => {
    setEditingProduct(p);
    setFormTitle(p.title);
    setFormSlug(p.slug);
    setFormSku(p.sku);
    setFormDescription(p.description || "Quality mother and baby care product.");
    setFormCategoryId(p.categoryId || categoryOptions[0]?.value || "skin-care");
    setFormBasePrice(Number(p.basePrice) || 850);
    setFormCostPrice(p.costPrice ? Number(p.costPrice) : 550);
    setFormImageUrl(p.images && p.images.length > 0 ? p.images[0] : "");
    setFormRequiresBatch(Boolean(p.requiresBatchTracking));
    setFormLowStockThreshold(p.lowStockThreshold || 10);
    setProductModalOpened(true);
  };

  const openFlashSaleModal = (p?: CatalogProductItem) => {
    if (p) {
      setSaleProductId(p.id);
    } else {
      setSaleProductId(products.length > 0 ? products[0].id : null);
    }
    setSaleDiscountType("PERCENTAGE");
    setSaleDiscountValue(20);
    // 7 days from now as default
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    setSaleEndsAt(nextWeek);
    setFlashSaleModalOpened(true);
  };

  const handleTitleChange = (val: string) => {
    setFormTitle(val);
    if (!editingProduct) {
      setFormSlug(
        val
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)+/g, ""),
      );
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const payload = {
        title: formTitle.trim(),
        slug: formSlug.trim() || undefined,
        sku: formSku.trim() || undefined,
        description: formDescription.trim() || "Quality mother and baby care product.",
        categoryId: formCategoryId || categoryOptions[0]?.value || "skin-care",
        basePrice: formBasePrice,
        costPrice: formCostPrice,
        images: formImageUrl.trim()
          ? [formImageUrl.trim()]
          : ["https://images.unsplash.com/photo-1556228720-195a672e8a03?w=500&auto=format&fit=crop&q=60"],
        requiresBatchTracking: formRequiresBatch,
        lowStockThreshold: Number(formLowStockThreshold) || 10,
      };

      if (editingProduct) {
        const res = await apiPatch(`/admin/catalog/products/${editingProduct.id}`, payload);
        if (!res.success) {
          const detail = res.details ? JSON.stringify(res.details) : res.error;
          throw new Error(detail || "Update failed");
        }
        notifications.show({
          title: "Product Updated",
          message: `${payload.title} was updated successfully`,
          color: "teal",
          icon: <IconCheck size={16} />,
        });
      } else {
        const res = await apiPost("/admin/catalog/products", payload);
        if (!res.success) {
          const detail = res.details ? JSON.stringify(res.details) : res.error;
          throw new Error(detail || "Creation failed");
        }
        notifications.show({
          title: "Product Created",
          message: `${payload.title} was added to catalog`,
          color: "teal",
          icon: <IconCheck size={16} />,
        });
      }

      setProductModalOpened(false);
      mutate();
    } catch (err: any) {
      notifications.show({
        title: "Validation / Operation Error",
        message: err.message || "Failed to save product",
        color: "red",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe DELETE via apiDelete
  const handleDeleteProduct = async () => {
    if (!deletingProduct) return;
    try {
      setIsSubmitting(true);
      const res = await apiDelete(`/admin/catalog/products/${deletingProduct.id}`);
      if (!res.success) {
        throw new Error(res.error || "Failed to delete product");
      }
      notifications.show({
        title: "Product Removed",
        message: res.message || `${deletingProduct.title} has been removed/deactivated`,
        color: "orange",
        icon: <IconCheck size={16} />,
      });
      setDeleteModalOpened(false);
      mutate();
    } catch (err: any) {
      notifications.show({
        title: "Error Deleting Product",
        message: err.message || "Failed to delete product",
        color: "red",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Toggle Reactivate
  const handleReactivateProduct = async (p: CatalogProductItem) => {
    try {
      const res = await apiPatch(`/admin/catalog/products/${p.id}`, { isActive: true });
      if (!res.success) throw new Error("Reactivation failed");
      notifications.show({
        title: "Product Restored",
        message: `${p.title} is now active in storefront`,
        color: "teal",
        icon: <IconCheck size={16} />,
      });
      mutate();
    } catch (err: any) {
      notifications.show({
        title: "Error Reactivating",
        message: err.message || "Could not restore product",
        color: "red",
      });
    }
  };

  const handleLaunchFlashSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!saleProductId) return;

    try {
      setIsSubmittingSale(true);
      const res = await apiPost("/admin/catalog/flash-sales", {
        productId: saleProductId,
        discountType: saleDiscountType,
        type: saleDiscountType,
        value: String(saleDiscountValue),
        startsAt: new Date().toISOString(),
        endsAt: saleEndsAt ? new Date(saleEndsAt).toISOString() : new Date(Date.now() + 86400000 * 3).toISOString(),
        isFlashSale: true,
      });

      if (!res.success) {
        throw new Error(typeof res.error === "string" ? res.error : "Failed to launch flash sale");
      }

      notifications.show({
        title: "⚡ Flash Sale Active!",
        message: `Discount of ${saleDiscountValue}${saleDiscountType === "PERCENTAGE" ? "%" : "৳"} launched successfully`,
        color: "teal",
        icon: <IconCheck size={16} />,
      });

      setFlashSaleModalOpened(false);
      mutate();
    } catch (err: any) {
      notifications.show({
        title: "Flash Sale Error",
        message: err.message || "Could not launch discount",
        color: "red",
      });
    } finally {
      setIsSubmittingSale(false);
    }
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="lg">
        {/* Header */}
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <Box>
            <Group gap="xs" align="center">
              <IconPackage size={28} color={myOxygenColors.primaryPink} />
              <Title
                order={2}
                style={{
                  fontFamily: "var(--font-poppins)",
                  color: myOxygenColors.darkText,
                  fontWeight: 700,
                }}
              >
                Products Catalog Manager
              </Title>
            </Group>
            <Text size="sm" c="dimmed" mt={4}>
              Manage Mother & Baby product records, prices, FEFO perishable tracking, and flash sales.
            </Text>
          </Box>

          <Group gap="sm">
            <Button
              variant="light"
              color="pink"
              leftSection={<IconBolt size={16} />}
              onClick={() => openFlashSaleModal()}
              style={{ fontWeight: 600 }}
            >
              Launch Flash Sale
            </Button>

            <Button
              color="pink"
              leftSection={<IconPlus size={16} />}
              onClick={openAddModal}
              style={{
                backgroundColor: myOxygenColors.primaryPink,
                fontWeight: 600,
              }}
            >
              Add New Product
            </Button>
          </Group>
        </Group>

        {/* Filter Bar */}
        <Paper p="md" radius="md" withBorder style={{ backgroundColor: "#FFFFFF" }}>
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <TextInput
              placeholder="Search by title, SKU, or keyword..."
              leftSection={<IconSearch size={16} color="#9CA3AF" />}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, minWidth: 240 }}
            />

            <Select
              placeholder="Filter by Category"
              value={selectedCategory}
              onChange={setSelectedCategory}
              data={[
                { value: "all", label: "All Categories" },
                ...categoryOptions.map((c) => ({ value: c.slug, label: c.label })),
              ]}
              style={{ width: 180 }}
            />

            <SegmentedControl
              size="sm"
              radius="md"
              value={statusFilter}
              onChange={setStatusFilter}
              data={[
                { label: "All", value: "all" },
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
              ]}
            />

            <Tooltip label="Refresh Catalog">
              <ActionIcon variant="light" color="pink" size="lg" onClick={() => mutate()}>
                <IconRefresh size={18} />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Paper>

        {/* Products Table */}
        <Paper radius="md" withBorder style={{ backgroundColor: "#FFFFFF", overflow: "hidden" }}>
          {isLoading && products.length === 0 ? (
            <Box py={60} style={{ textAlign: "center" }}>
              <Loader color="pink" size="md" />
              <Text size="sm" c="dimmed" mt="md">
                Loading products from catalog...
              </Text>
            </Box>
          ) : error ? (
            <Box p="xl">
              <Alert icon={<IconAlertTriangle size={16} />} title="Error" color="red">
                Failed to load products. Please ensure the backend is running.
              </Alert>
            </Box>
          ) : products.length === 0 ? (
            <Box py={60} style={{ textAlign: "center" }}>
              <Text size="md" fw={600} c="dimmed">
                No products found matching your filter criteria.
              </Text>
              <Button size="sm" variant="subtle" color="pink" mt="xs" onClick={openAddModal}>
                Create new product
              </Button>
            </Box>
          ) : (
            <Box style={{ overflowX: "auto" }}>
              <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
                <Table.Thead style={{ backgroundColor: "#FFF8F6" }}>
                  <Table.Tr>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>Product</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>SKU</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>Base Price</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>Effective Price</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>Stock</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>Tracking</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12 }}>Status</Table.Th>
                    <Table.Th style={{ color: "#4B5563", fontSize: 12, textAlign: "right" }}>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {products.map((item) => {
                    const isItemActive = item.isActive !== false;
                    return (
                      <Table.Tr
                        key={item.id}
                        style={{
                          opacity: isItemActive ? 1 : 0.6,
                          backgroundColor: isItemActive ? undefined : "#FFFBFB",
                        }}
                      >
                        {/* Product Thumbnail & Title */}
                        <Table.Td>
                          <Group gap="sm" wrap="nowrap">
                            <Image
                              src={item.images && item.images[0] ? item.images[0] : "/placeholder.png"}
                              alt={item.title}
                              width={42}
                              height={42}
                              radius="md"
                              fallbackSrc="https://placehold.co/100x100?text=Product"
                              style={{ objectFit: "cover", flexShrink: 0 }}
                            />
                            <Box style={{ maxWidth: 220 }}>
                              <Text size="sm" fw={600} lineClamp={1} c={myOxygenColors.darkText}>
                                {item.title}
                              </Text>
                              <Text size="xs" c="dimmed" lineClamp={1}>
                                {item.slug}
                              </Text>
                            </Box>
                          </Group>
                        </Table.Td>

                        {/* SKU */}
                        <Table.Td>
                          <Badge variant="light" color="gray" size="sm" radius="sm">
                            {item.sku}
                          </Badge>
                        </Table.Td>

                        {/* Base Price */}
                        <Table.Td>
                          <Text size="sm" fw={600} c={myOxygenColors.darkText}>
                            ৳ {item.basePrice}
                          </Text>
                        </Table.Td>

                        {/* Effective Price */}
                        <Table.Td>
                          <Group gap={6} align="center">
                            <Text size="sm" fw={700} c={myOxygenColors.primaryPink}>
                              ৳ {item.effectivePrice}
                            </Text>
                            {item.discount && (
                              <Badge size="xs" color="pink" variant="filled">
                                SALE
                              </Badge>
                            )}
                          </Group>
                        </Table.Td>

                        {/* Total Stock */}
                        <Table.Td>
                          {item.totalAvailable === 0 ? (
                            <Badge color="red" variant="light" size="sm">
                              Out of Stock
                            </Badge>
                          ) : item.isLowStock ? (
                            <Badge color="orange" variant="light" size="sm">
                              Low: {item.totalAvailable} left
                            </Badge>
                          ) : (
                            <Badge color="teal" variant="light" size="sm">
                              {item.totalAvailable} in stock
                            </Badge>
                          )}
                        </Table.Td>

                        {/* Batch Tracking Indicator */}
                        <Table.Td>
                          {item.requiresBatchTracking ? (
                            <Badge color="cyan" variant="dot" size="sm">
                              FEFO
                            </Badge>
                          ) : (
                            <Badge color="gray" variant="dot" size="sm">
                              Standard
                            </Badge>
                          )}
                        </Table.Td>

                        {/* Status */}
                        <Table.Td>
                          {isItemActive ? (
                            <Badge color="teal" variant="light" size="sm">
                              Active
                            </Badge>
                          ) : (
                            <Badge color="red" variant="outline" size="sm">
                              Deactivated
                            </Badge>
                          )}
                        </Table.Td>

                        {/* Actions */}
                        <Table.Td style={{ textAlign: "right" }}>
                          <Group gap={6} justify="flex-end" wrap="nowrap">
                            <Tooltip label="Launch Flash Sale">
                              <ActionIcon
                                variant="subtle"
                                color="pink"
                                size="sm"
                                onClick={() => openFlashSaleModal(item)}
                              >
                                <IconBolt size={16} />
                              </ActionIcon>
                            </Tooltip>

                            <Tooltip label="Edit Product">
                              <ActionIcon
                                variant="subtle"
                                color="blue"
                                size="sm"
                                onClick={() => openEditModal(item)}
                              >
                                <IconEdit size={16} />
                              </ActionIcon>
                            </Tooltip>

                            {isItemActive ? (
                              <Tooltip label="Deactivate / Delete">
                                <ActionIcon
                                  variant="subtle"
                                  color="red"
                                  size="sm"
                                  onClick={() => {
                                    setDeletingProduct(item);
                                    setDeleteModalOpened(true);
                                  }}
                                >
                                  <IconTrash size={16} />
                                </ActionIcon>
                              </Tooltip>
                            ) : (
                              <Tooltip label="Restore to Storefront">
                                <ActionIcon
                                  variant="subtle"
                                  color="teal"
                                  size="sm"
                                  onClick={() => handleReactivateProduct(item)}
                                >
                                  <IconEye size={16} />
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </Group>
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Box>
          )}
        </Paper>
      </Stack>

      {/* Add / Edit Product Modal */}
      <Modal
        opened={productModalOpened}
        onClose={() => setProductModalOpened(false)}
        title={
          <Text fw={700} size="md" c={myOxygenColors.darkText}>
            {editingProduct ? "Edit Product Record" : "Add New Mother & Baby Product"}
          </Text>
        }
        radius="lg"
        size="lg"
      >
        <form onSubmit={handleSaveProduct}>
          <Stack gap="md">
            <TextInput
              label="Product Title"
              placeholder="e.g. Natural Organic Baby Wash"
              required
              value={formTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
            />

            <Group grow align="flex-start">
              <TextInput
                label="Product Slug"
                placeholder="natural-organic-baby-wash"
                required
                value={formSlug}
                onChange={(e) => setFormSlug(e.target.value)}
              />

              <TextInput
                label="SKU Code"
                placeholder="SKN-BW-001"
                required
                value={formSku}
                onChange={(e) => setFormSku(e.target.value)}
              />
            </Group>

            <Group grow align="flex-start">
              <Select
                label="Category"
                data={categoryOptions.map((c) => ({ value: c.value, label: c.label }))}
                value={formCategoryId}
                onChange={setFormCategoryId}
                required
              />

              <TextInput
                label="Product Image URL"
                placeholder="https://images.unsplash.com/..."
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
              />
            </Group>

            <Group grow align="flex-start">
              <NumberInput
                label="Customer Base Price (৳)"
                prefix="৳ "
                min={0}
                required
                value={formBasePrice}
                onChange={setFormBasePrice}
              />

              <NumberInput
                label="Internal Cost Price (৳)"
                prefix="৳ "
                min={0}
                required
                value={formCostPrice}
                onChange={setFormCostPrice}
              />
            </Group>

            <Textarea
              label="Description & Care Instructions"
              placeholder="Describe the formulation, safe ingredients, and instructions..."
              minRows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />

            <Group justify="space-between" align="center" p="xs" style={{ backgroundColor: "#FFF8F6", borderRadius: 8 }}>
              <Box>
                <Text size="sm" fw={600}>
                  FEFO Perishable Batch Tracking
                </Text>
                <Text size="xs" c="dimmed">
                  Enforce strict First-Expired, First-Out perishable batch allocation
                </Text>
              </Box>
              <Switch
                checked={formRequiresBatch}
                onChange={(e) => setFormRequiresBatch(e.currentTarget.checked)}
                color="pink"
              />
            </Group>

            <NumberInput
              label="Low Stock Warning Threshold (Units)"
              min={1}
              value={formLowStockThreshold}
              onChange={setFormLowStockThreshold}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="light" color="gray" onClick={() => setProductModalOpened(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                color="pink"
                loading={isSubmitting}
                style={{ backgroundColor: myOxygenColors.primaryPink }}
              >
                {editingProduct ? "Update Product" : "Create Product"}
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Launch Flash Sale Modal */}
      <Modal
        opened={flashSaleModalOpened}
        onClose={() => setFlashSaleModalOpened(false)}
        title={
          <Group gap={6}>
            <IconBolt size={20} color={myOxygenColors.primaryPink} />
            <Text fw={700} size="md">
              Launch Real-Time Flash Sale
            </Text>
          </Group>
        }
        radius="lg"
      >
        <form onSubmit={handleLaunchFlashSale}>
          <Stack gap="md">
            <Select
              label="Target Product"
              data={products.map((p) => ({ value: p.id, label: `${p.title} (৳ ${p.basePrice})` }))}
              value={saleProductId}
              onChange={setSaleProductId}
              required
            />

            <Group grow>
              <Select
                label="Discount Type"
                data={[
                  { value: "PERCENTAGE", label: "Percentage (%)" },
                  { value: "FIXED_AMOUNT", label: "Fixed Amount (৳)" },
                ]}
                value={saleDiscountType}
                onChange={(val) => setSaleDiscountType(val as any)}
                required
              />

              <NumberInput
                label="Discount Value"
                min={1}
                required
                value={saleDiscountValue}
                onChange={setSaleDiscountValue}
              />
            </Group>

            <TextInput
              label="Flash Sale Expiration Date/Time"
              type="datetime-local"
              required
              value={saleEndsAt}
              onChange={(e) => setSaleEndsAt(e.target.value)}
            />

            <Group justify="flex-end" mt="md">
              <Button variant="light" color="gray" onClick={() => setFlashSaleModalOpened(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                color="pink"
                loading={isSubmittingSale}
                style={{ backgroundColor: myOxygenColors.primaryPink }}
              >
                Launch Sale
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Delete / Deactivate Confirmation Modal */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => setDeleteModalOpened(false)}
        title="Confirm Product Deletion / Deactivation"
        radius="lg"
      >
        <Text size="sm">
          Are you sure you want to remove <strong>{deletingProduct?.title}</strong>?
          <br />
          If the product has historical orders, it will be safely deactivated to preserve past customer invoices and inventory ledgers. If it has no orders, it will be permanently deleted.
        </Text>
        <Group justify="flex-end" mt="lg">
          <Button variant="light" color="gray" onClick={() => setDeleteModalOpened(false)}>
            Cancel
          </Button>
          <Button color="red" loading={isSubmitting} onClick={handleDeleteProduct}>
            Confirm Remove
          </Button>
        </Group>
      </Modal>
    </Container>
  );
}
