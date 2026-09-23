"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Container,
  Grid,
  Box,
  Text,
  Title,
  Breadcrumbs,
  Anchor,
  Badge,
  Group,
  Stack,
  Rating,
  NumberInput,
  ActionIcon,
  Alert,
  Tabs,
  Paper,
  Table,
  SimpleGrid,
  Divider,
  Loader,
  Center,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconShieldCheck,
  IconTruckDelivery,
  IconRotate2,
  IconCertificate,
  IconShoppingCart,
  IconBolt,
  IconChevronRight,
  IconPlus,
  IconMinus,
  IconCalendarTime,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react";
import Image from "next/image";

import { Navbar } from "../../../components/Navbar";
import { Footer } from "../../../components/Footer";
import { MobileBottomNav } from "../../../components/MobileBottomNav";
import { BrandButton } from "../../../components/BrandButton";
import { ProductCard } from "../../../components/ProductCard";
import { CountDownTimer } from "../../../components/CountDownTimer";
import { useProductDetail } from "../../../hooks/use-product-detail";
import { useCartStore } from "../../../lib/cart-store";
import { myOxygenColors } from "../../../tokens";

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = params?.slug || "";

  const { product, earliestExpiryDate, totalAvailableStock, isLoading, isError } =
    useProductDetail(slug);

  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [quantity, setQuantity] = useState<number>(1);
  const addItem = useCartStore((state) => state.addItem);
  const closeDrawer = useCartStore((state) => state.closeDrawer);

  if (isLoading) {
    return (
      <Box style={{ minHeight: "100vh" }}>
        <Navbar />
        <Center style={{ height: "60vh" }}>
          <Stack align="center" gap="sm">
            <Loader color="primaryPink" size="lg" />
            <Text size="sm" c="dimmed">
              Loading product details...
            </Text>
          </Stack>
        </Center>
        <Footer />
        <MobileBottomNav />
      </Box>
    );
  }

  if (isError || !product) {
    return (
      <Box style={{ minHeight: "100vh" }}>
        <Navbar />
        <Container size="md" py="5rem">
          <Paper p="xl" radius="lg" style={{ textAlign: "center", backgroundColor: "#FFFFFF" }}>
            <IconAlertCircle size={48} color="#FF6B8B" style={{ margin: "0 auto 16px" }} />
            <Title order={2} c={myOxygenColors.darkText} mb="xs">
              Product Not Found
            </Title>
            <Text size="sm" c="dimmed" mb="lg">
              The product you are looking for might have been retired or does not exist.
            </Text>
            <BrandButton
              component={Link}
              href="/products"
              variant="primary"
              size="md"
              radius="xl"
            >
              Browse All Products
            </BrandButton>
          </Paper>
        </Container>
        <Footer />
        <MobileBottomNav />
      </Box>
    );
  }

  const images = product.images && product.images.length > 0 ? product.images : ["/placeholder.png"];
  const currentImage = images[selectedImageIndex] || images[0];

  const basePriceNum = parseFloat(product.basePrice) || 0;
  const effectivePriceNum = product.effectivePrice || basePriceNum;
  const hasDiscount = basePriceNum > effectivePriceNum;
  const discountPercent = hasDiscount
    ? Math.round(((basePriceNum - effectivePriceNum) / basePriceNum) * 100)
    : 0;

  const isOutOfStock = product.isOutOfStock || totalAvailableStock <= 0;
  const maxPurchaseQty = Math.max(1, Math.min(totalAvailableStock || 10, 10));

  const formattedExpiry = (() => {
    if (!earliestExpiryDate) return null;
    const date = new Date(earliestExpiryDate);
    if (isNaN(date.getTime())) return earliestExpiryDate;
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  })();

  const handleAddToCart = () => {
    if (isOutOfStock) return;
    addItem({
      id: product.id,
      title: product.title,
      slug: product.slug,
      image: images[0],
      unitPrice: effectivePriceNum,
      originalPrice: basePriceNum,
      maxStock: totalAvailableStock,
      requiresBatchTracking: product.requiresBatchTracking,
      earliestExpiry: earliestExpiryDate,
      quantity,
    });

    notifications.show({
      title: "Added to Cart!",
      message: `${quantity} × ${product.title} added to your cart.`,
      color: "teal",
      icon: <IconCheck size={16} />,
    });
  };

  const handleBuyNow = () => {
    if (isOutOfStock) return;
    handleAddToCart();
    closeDrawer();
    router.push("/checkout");
  };

  return (
    <Box style={{ minHeight: "100vh", paddingBottom: 60 }}>
      <Navbar />

      <Container size="xl" py="lg">
        {/* Breadcrumbs */}
        <Breadcrumbs
          separator={<IconChevronRight size={14} color="#9CA3AF" />}
          mb="xl"
        >
          <Anchor component={Link} href="/" size="xs" c="dimmed">
            Home
          </Anchor>
          <Anchor component={Link} href="/products" size="xs" c="dimmed">
            Products
          </Anchor>
          <Text size="xs" fw={600} c={myOxygenColors.primaryPink} lineClamp={1}>
            {product.title}
          </Text>
        </Breadcrumbs>

        {/* Product Hero Grid */}
        <Grid gap={40} mb="3rem">
          {/* Left Column: Image Gallery */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Box style={{ position: "sticky", top: 90 }}>
              {/* Main Display Image */}
              <Box
                style={{
                  position: "relative",
                  width: "100%",
                  aspectRatio: "1 / 1",
                  borderRadius: 16,
                  overflow: "hidden",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #F3F4F6",
                  boxShadow: "0 8px 30px rgba(0, 0, 0, 0.05)",
                }}
              >
                <Image
                  src={currentImage}
                  alt={product.title}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  style={{ objectFit: "contain", padding: 16 }}
                  priority
                />

                {hasDiscount && (
                  <Badge
                    size="lg"
                    radius="sm"
                    variant="filled"
                    color="primaryPink"
                    style={{
                      position: "absolute",
                      top: 16,
                      left: 16,
                      fontWeight: 700,
                      boxShadow: "0 2px 8px rgba(255, 107, 139, 0.4)",
                    }}
                  >
                    {discountPercent}% OFF
                  </Badge>
                )}
              </Box>

              {/* Thumbnails */}
              {images.length > 1 && (
                <Group gap="sm" mt="md" justify="center">
                  {images.map((img, idx) => {
                    const isSelected = selectedImageIndex === idx;
                    return (
                      <Box
                        key={idx}
                        onClick={() => setSelectedImageIndex(idx)}
                        style={{
                          width: 68,
                          height: 68,
                          borderRadius: 10,
                          overflow: "hidden",
                          cursor: "pointer",
                          backgroundColor: "#FFFFFF",
                          border: `2px solid ${isSelected ? myOxygenColors.primaryPink : "#E5E7EB"}`,
                          position: "relative",
                          boxShadow: isSelected ? "0 2px 10px rgba(255, 107, 139, 0.25)" : "none",
                          transition: "all 0.2s ease",
                        }}
                      >
                        <Image
                          src={img}
                          alt={`${product.title} thumbnail ${idx + 1}`}
                          fill
                          sizes="68px"
                          style={{ objectFit: "cover" }}
                        />
                      </Box>
                    );
                  })}
                </Group>
              )}
            </Box>
          </Grid.Col>

          {/* Right Column: Product Info & Actions */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="md">
              {/* Category & Stock Badges */}
              <Group justify="space-between" align="center">
                <Badge size="md" variant="light" color="primaryPink">
                  SKU: {product.sku}
                </Badge>

                {isOutOfStock ? (
                  <Badge size="md" variant="filled" color="red">
                    Out of Stock
                  </Badge>
                ) : product.isLowStock ? (
                  <Badge size="md" variant="filled" color="orange">
                    Low Stock: Only {totalAvailableStock} left!
                  </Badge>
                ) : (
                  <Badge size="md" variant="light" color="teal">
                    In Stock ({totalAvailableStock} units)
                  </Badge>
                )}
              </Group>

              {/* Title */}
              <Title
                order={1}
                style={{
                  fontFamily: "var(--font-poppins)",
                  fontSize: "2rem",
                  fontWeight: 700,
                  color: myOxygenColors.darkText,
                  lineHeight: 1.25,
                }}
              >
                {product.title}
              </Title>

              {/* Star Rating Display */}
              <Group gap="xs" align="center">
                <Rating value={4.8} fractions={2} readOnly color="yellow" size="sm" />
                <Text size="sm" fw={600} c={myOxygenColors.darkText}>
                  4.8
                </Text>
                <Text size="xs" c="dimmed">
                  (42 verified buyer reviews)
                </Text>
              </Group>

              {/* Batch Transparency Alert */}
              {product.requiresBatchTracking && (
                <Alert
                  icon={<IconShieldCheck size={24} color="#2C7A52" />}
                  title="Guaranteed Fresh • Perishable Transparency"
                  styles={{
                    root: {
                      backgroundColor: "#E8F8F0",
                      border: "1px solid #4CAF7D",
                      borderRadius: 12,
                    },
                    title: {
                      color: "#205B3D",
                      fontWeight: 700,
                    },
                    message: {
                      color: "#2C7A52",
                      fontSize: 14,
                    },
                  }}
                >
                  <Text size="sm" fw={600}>
                    {formattedExpiry ? (
                      <>
                        Earliest batch expires: <b>{formattedExpiry}</b> • {totalAvailableStock} units ready in verified FEFO stock
                      </>
                    ) : (
                      <>Full batch verification active • Guaranteed authentic, unexpired freshness</>
                    )}
                  </Text>
                </Alert>
              )}

              {/* Flash Sale Banner if active */}
              {product.activeDiscount?.isFlashSale && product.activeDiscount.endsAt && (
                <Paper
                  p="sm"
                  radius="md"
                  style={{
                    backgroundColor: "#FFF0F3",
                    border: "1px dashed #FF6B8B",
                  }}
                >
                  <Group justify="space-between" align="center">
                    <Group gap="xs">
                      <IconBolt size={18} color={myOxygenColors.primaryPink} />
                      <Text size="xs" fw={700} c={myOxygenColors.primaryPink}>
                        FLASH SALE ENDS IN:
                      </Text>
                    </Group>
                    <CountDownTimer endsAt={product.activeDiscount.endsAt} />
                  </Group>
                </Paper>
              )}

              {/* Pricing Section */}
              <Group align="baseline" gap="sm" mt="xs">
                <Text
                  fw={800}
                  style={{
                    fontSize: "2.2rem",
                    color: myOxygenColors.primaryPink,
                    fontFamily: "var(--font-poppins)",
                  }}
                >
                  ৳ {effectivePriceNum.toLocaleString()}
                </Text>

                {hasDiscount && (
                  <Text size="xl" td="line-through" c="dimmed" fw={500}>
                    ৳ {basePriceNum.toLocaleString()}
                  </Text>
                )}

                {hasDiscount && (
                  <Badge variant="filled" color="primaryPink" size="md">
                    Save ৳{(basePriceNum - effectivePriceNum).toLocaleString()}
                  </Badge>
                )}
              </Group>

              <Divider my="xs" />

              {/* Quantity Selector & CTAs */}
              <Box>
                <Text size="sm" fw={700} c={myOxygenColors.darkText} mb="xs">
                  Quantity
                </Text>
                <Group gap="md">
                  <Group
                    gap={4}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: 100,
                      padding: "4px 8px",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      radius="xl"
                      disabled={quantity <= 1 || isOutOfStock}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      aria-label="Decrease quantity"
                    >
                      <IconMinus size={14} />
                    </ActionIcon>
                    <Text
                      fw={700}
                      size="sm"
                      style={{ minWidth: 32, textAlign: "center" }}
                    >
                      {quantity}
                    </Text>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      radius="xl"
                      disabled={quantity >= maxPurchaseQty || isOutOfStock}
                      onClick={() => setQuantity((q) => Math.min(maxPurchaseQty, q + 1))}
                      aria-label="Increase quantity"
                    >
                      <IconPlus size={14} />
                    </ActionIcon>
                  </Group>

                  <Text size="xs" c="dimmed">
                    {isOutOfStock
                      ? "Currently unavailable"
                      : `Max ${maxPurchaseQty} per order`}
                  </Text>
                </Group>
              </Box>

              {/* Action Buttons */}
              <Group gap="md" mt="sm">
                <BrandButton
                  variant="primary"
                  size="lg"
                  radius="xl"
                  style={{ flex: 1 }}
                  disabled={isOutOfStock}
                  onClick={handleAddToCart}
                  leftSection={<IconShoppingCart size={20} />}
                >
                  {isOutOfStock ? "Out of Stock" : "Add to Cart"}
                </BrandButton>

                <BrandButton
                  variant="secondary"
                  size="lg"
                  radius="xl"
                  style={{ flex: 1 }}
                  disabled={isOutOfStock}
                  onClick={handleBuyNow}
                  leftSection={<IconBolt size={20} />}
                >
                  Buy Now
                </BrandButton>
              </Group>

              {/* Value Propositions */}
              <Paper
                p="md"
                radius="lg"
                mt="md"
                style={{
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #F3F4F6",
                }}
              >
                <Stack gap="sm">
                  <Group gap="sm" align="center">
                    <IconCertificate size={20} color="#4CAF7D" />
                    <Text size="xs" fw={600} c={myOxygenColors.darkText}>
                      100% Authentic Guaranteed (Single-owner verified direct import)
                    </Text>
                  </Group>
                  <Group gap="sm" align="center">
                    <IconTruckDelivery size={20} color="#4CAF7D" />
                    <Text size="xs" fw={600} c={myOxygenColors.darkText}>
                      FREE delivery across Bangladesh on orders over ৳1,500 (Flat ৳60 otherwise)
                    </Text>
                  </Group>
                  <Group gap="sm" align="center">
                    <IconRotate2 size={20} color="#4CAF7D" />
                    <Text size="xs" fw={600} c={myOxygenColors.darkText}>
                      7-day hassle-free return policy for sealed products
                    </Text>
                  </Group>
                </Stack>
              </Paper>
            </Stack>
          </Grid.Col>
        </Grid>

        {/* Detailed Information Tabs */}
        <Paper
          p="xl"
          radius="lg"
          mb="3rem"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #F3F4F6",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
          }}
        >
          <Tabs defaultValue="description" color="primaryPink">
            <Tabs.List mb="lg">
              <Tabs.Tab value="description" fw={600}>
                Description
              </Tabs.Tab>
              <Tabs.Tab value="ingredients" fw={600}>
                Specifications & Details
              </Tabs.Tab>
              {product.requiresBatchTracking && (
                <Tabs.Tab
                  value="batch"
                  fw={600}
                  leftSection={<IconCalendarTime size={16} />}
                >
                  Batch Transparency & Quality
                </Tabs.Tab>
              )}
              <Tabs.Tab value="returns" fw={600}>
                Delivery & Returns
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="description">
              <Text size="sm" c={myOxygenColors.darkText} style={{ lineHeight: 1.8 }}>
                {product.description ||
                  "No detailed description provided for this item yet."}
              </Text>
            </Tabs.Panel>

            <Tabs.Panel value="ingredients">
              <Stack gap="sm">
                <Text size="sm" fw={600}>
                  Product SKU: <span style={{ fontWeight: 400 }}>{product.sku}</span>
                </Text>
                <Text size="sm" fw={600}>
                  Category:{" "}
                  <span style={{ fontWeight: 400 }}>
                    {product.categoryId}
                  </span>
                </Text>
                <Text size="sm" fw={600}>
                  Batch Tracking Enforced:{" "}
                  <span style={{ fontWeight: 400 }}>
                    {product.requiresBatchTracking ? "Yes (FEFO compliance)" : "No"}
                  </span>
                </Text>
                <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }}>
                  Every item sold on My Oxygen is procured directly through authorized pharmaceutical and hygienic supply chains. We guarantee zero counterfeit items.
                </Text>
              </Stack>
            </Tabs.Panel>

            {product.requiresBatchTracking && (
              <Tabs.Panel value="batch">
                <Stack gap="md">
                  <Text size="sm" c="dimmed">
                    To maintain the highest level of trust with mothers and families, My Oxygen provides real-time visibility into the current live inventory batches allocated via <b>First-Expired, First-Out (FEFO)</b>:
                  </Text>

                  {product.batchSummary && product.batchSummary.length > 0 ? (
                    <Table
                      striped
                      highlightOnHover
                      withTableBorder
                      withColumnBorders
                      style={{ fontSize: 13 }}
                    >
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Batch #</Table.Th>
                          <Table.Th>Expiry Date</Table.Th>
                          <Table.Th>Available Stock</Table.Th>
                          <Table.Th>Quality Status</Table.Th>
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {product.batchSummary.map((batch, index) => (
                          <Table.Tr key={batch.batchNumber}>
                            <Table.Td fw={600}>{batch.batchNumber}</Table.Td>
                            <Table.Td>
                              {new Date(batch.expiryDate).toLocaleDateString("en-US", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </Table.Td>
                            <Table.Td>{batch.availableQuantity} units</Table.Td>
                            <Table.Td>
                              <Badge size="xs" color={index === 0 ? "teal" : "blue"}>
                                {index === 0 ? "Active Dispatch" : "In Reserve"}
                              </Badge>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                      </Table.Tbody>
                    </Table>
                  ) : (
                    <Text size="sm" c="dimmed">
                      No active batches currently logged.
                    </Text>
                  )}
                </Stack>
              </Tabs.Panel>
            )}

            <Tabs.Panel value="returns">
              <Stack gap="sm">
                <Text size="sm" fw={700}>
                  Fast Delivery Across Bangladesh
                </Text>
                <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }}>
                  - Inside Dhaka: Next business day delivery via Steadfast courier.<br />
                  - Outside Dhaka: 2 to 3 business days nationwide.<br />
                  - Free shipping on all orders over ৳1,500. Flat ৳60 shipping for orders below ৳1,500.
                </Text>
                <Text size="sm" fw={700} mt="xs">
                  Return & Exchange Policy
                </Text>
                <Text size="sm" c="dimmed" style={{ lineHeight: 1.7 }}>
                  If you receive damaged goods or an item differing from the catalog description, contact our support team within 7 days of delivery for an immediate replacement or full refund.
                </Text>
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Paper>

        {/* Related Products */}
        {product.relatedProducts && product.relatedProducts.length > 0 && (
          <Box mb="3rem">
            <Title
              order={2}
              style={{
                fontFamily: "var(--font-poppins)",
                fontSize: "1.6rem",
                color: myOxygenColors.darkText,
                marginBottom: 20,
              }}
            >
              Related Essentials You Might Need
            </Title>
            <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 4 }} spacing="lg">
              {product.relatedProducts.map((rel) => (
                <ProductCard
                  key={rel.id}
                  id={rel.id}
                  title={rel.title}
                  slug={rel.slug}
                  image={rel.images?.[0] || "/placeholder.png"}
                  basePrice={rel.basePrice}
                  onCardClick={() => router.push(`/products/${rel.slug || rel.id}`)}
                />
              ))}
            </SimpleGrid>
          </Box>
        )}
      </Container>

      <Footer />
      <MobileBottomNav />
    </Box>
  );
}
