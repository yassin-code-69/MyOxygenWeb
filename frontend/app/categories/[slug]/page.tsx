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
  TextInput,
  Select,
  RangeSlider,
  Switch,
  Button,
  SimpleGrid,
  Pagination,
  Group,
  Stack,
  Badge,
  Paper,
  ActionIcon,
  Drawer,
} from "@mantine/core";
import { useDebouncedValue, useDisclosure } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconSearch,
  IconAdjustmentsHorizontal,
  IconX,
  IconMoodEmpty,
  IconChevronRight,
  IconCheck,
  IconSparkles,
} from "@tabler/icons-react";
import { motion } from "motion/react";

import { Navbar } from "../../../components/Navbar";
import { Footer } from "../../../components/Footer";
import { MobileBottomNav } from "../../../components/MobileBottomNav";
import { ProductCard } from "../../../components/ProductCard";
import { ProductCardSkeleton } from "../../../components/ProductCardSkeleton";
import { BrandButton } from "../../../components/BrandButton";
import { useProducts } from "../../../hooks/use-products";
import { useCartStore } from "../../../lib/cart-store";
import { coreCategories } from "../../../tokens/categories";
import { myOxygenColors } from "../../../tokens";
import { staggerContainer, fadeInUp } from "../../../lib/animations";
import type { CatalogProductItem } from "../../../types";

export default function CategoryLandingPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || "";
  const router = useRouter();

  const categoryMeta = coreCategories.find((c) => c.slug === slug);
  const categoryTitle = categoryMeta ? categoryMeta.name : slug.replace("-", " ").toUpperCase();
  const categoryTagline = categoryMeta?.tagline || "Curated essentials for wellness & care";
  const categoryBadge = categoryMeta?.badge || "100% Authentic Quality Guaranteed";
  const accentColor = categoryMeta?.color || myOxygenColors.primaryPink;

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebouncedValue(searchQuery, 350);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [debouncedPriceRange] = useDebouncedValue(priceRange, 300);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("newest");
  const [currentPage, setCurrentPage] = useState(1);

  const [mobileFilterOpened, { open: openMobileFilter, close: closeMobileFilter }] =
    useDisclosure(false);

  const addItem = useCartStore((state) => state.addItem);

  const { products, pagination, isLoading, isError } = useProducts({
    categorySlug: slug,
    q: debouncedSearch,
    minPrice: debouncedPriceRange[0] > 0 ? debouncedPriceRange[0] : undefined,
    maxPrice: debouncedPriceRange[1] < 5000 ? debouncedPriceRange[1] : undefined,
    inStockOnly,
    sort: sortBy,
    page: currentPage,
    limit: 12,
  });

  const handleClearFilters = () => {
    setSearchQuery("");
    setPriceRange([0, 5000]);
    setInStockOnly(false);
    setSortBy("newest");
    setCurrentPage(1);
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    priceRange[0] > 0 ||
    priceRange[1] < 5000 ||
    inStockOnly;

  const handleAddToCart = (product: CatalogProductItem) => {
    addItem({
      id: product.id,
      title: product.title,
      slug: product.slug,
      image: product.images?.[0] || "/placeholder.png",
      unitPrice: product.effectivePrice || parseFloat(product.basePrice) || 0,
      originalPrice: parseFloat(product.basePrice) || undefined,
      maxStock: product.totalAvailable,
      requiresBatchTracking: product.requiresBatchTracking,
      earliestExpiry: product.earliestExpiry,
      quantity: 1,
    });

    notifications.show({
      title: "Added to Cart",
      message: `${product.title} has been added to your shopping bag.`,
      color: "teal",
      icon: <IconCheck size={16} />,
    });
  };

  const filterSidebarContent = (
    <Stack gap="lg">
      {/* Category Pills Switcher */}
      <Box>
        <Text fw={700} size="sm" c={myOxygenColors.darkText} mb="xs">
          Browse Categories
        </Text>
        <Stack gap={6}>
          <Paper
            p="xs"
            radius="md"
            component={Link}
            href="/products"
            style={{
              textDecoration: "none",
              backgroundColor: "#FFFFFF",
              border: "1px solid #E5E7EB",
            }}
          >
            <Text size="sm" fw={500} c={myOxygenColors.darkText}>
              All Categories
            </Text>
          </Paper>

          {coreCategories.map((cat) => {
            const isCurrent = cat.slug === slug;
            return (
              <Paper
                key={cat.slug}
                p="xs"
                radius="md"
                component={Link}
                href={`/categories/${cat.slug}`}
                style={{
                  textDecoration: "none",
                  backgroundColor: isCurrent ? "#FFF0F3" : "#FFFFFF",
                  border: `1px solid ${isCurrent ? myOxygenColors.primaryPink : "#E5E7EB"}`,
                }}
              >
                <Text
                  size="sm"
                  fw={isCurrent ? 700 : 500}
                  c={isCurrent ? myOxygenColors.primaryPink : myOxygenColors.darkText}
                >
                  {cat.name}
                </Text>
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {/* Price Range */}
      <Box>
        <Group justify="space-between" mb={8}>
          <Text fw={700} size="sm" c={myOxygenColors.darkText}>
            Price Range
          </Text>
          <Text size="xs" fw={600} c={myOxygenColors.primaryPink}>
            ৳{priceRange[0]} - ৳{priceRange[1]}
          </Text>
        </Group>
        <RangeSlider
          min={0}
          max={5000}
          step={100}
          value={priceRange}
          onChange={(val) => {
            setPriceRange(val);
            setCurrentPage(1);
          }}
          color="primaryPink"
          size="sm"
          marks={[
            { value: 0, label: "৳0" },
            { value: 2500, label: "৳2.5k" },
            { value: 5000, label: "৳5k" },
          ]}
          mb="lg"
        />
      </Box>

      {/* In Stock Only */}
      <Box>
        <Switch
          label="In Stock Only"
          checked={inStockOnly}
          onChange={(e) => {
            setInStockOnly(e.currentTarget.checked);
            setCurrentPage(1);
          }}
          color="primaryPink"
          styles={{
            label: {
              fontWeight: 600,
              fontSize: "14px",
              cursor: "pointer",
            },
          }}
        />
      </Box>

      {isFiltered && (
        <Button
          variant="light"
          color="gray"
          size="xs"
          radius="xl"
          onClick={handleClearFilters}
          leftSection={<IconX size={14} />}
        >
          Reset Filters
        </Button>
      )}
    </Stack>
  );

  return (
    <Box style={{ minHeight: "100vh", paddingBottom: 60 }}>
      <Navbar />

      <Container size="xl" py="lg">
        {/* Breadcrumbs */}
        <Breadcrumbs
          separator={<IconChevronRight size={14} color="#9CA3AF" />}
          mb="md"
        >
          <Anchor component={Link} href="/" size="xs" c="dimmed">
            Home
          </Anchor>
          <Anchor component={Link} href="/products" size="xs" c="dimmed">
            Categories
          </Anchor>
          <Text size="xs" fw={600} c={myOxygenColors.primaryPink}>
            {categoryTitle}
          </Text>
        </Breadcrumbs>

        {/* Hero Category Banner */}
        <Paper
          p={{ base: "xl", md: "2.5rem" }}
          radius="lg"
          mb="xl"
          style={{
            background: `linear-gradient(135deg, #FFF0F3 0%, #FFFFFF 100%)`,
            border: "1px solid #FEE2E2",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Box style={{ maxWidth: 650, position: "relative", zIndex: 2 }}>
            <Badge
              size="sm"
              variant="filled"
              color="primaryPink"
              leftSection={<IconSparkles size={12} />}
              mb="sm"
            >
              {categoryBadge}
            </Badge>

            <Title
              order={1}
              style={{
                fontFamily: "var(--font-poppins)",
                fontSize: "2.2rem",
                color: myOxygenColors.darkText,
                marginBottom: 8,
              }}
            >
              {categoryTitle}
            </Title>

            <Text size="md" c="dimmed" fw={500}>
              {categoryTagline}
            </Text>
          </Box>
        </Paper>

        {/* Search & Sort Bar */}
        <Paper
          p="md"
          radius="lg"
          mb="xl"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid #F3F4F6",
            boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
          }}
        >
          <Grid align="center" gap="md">
            <Grid.Col span={{ base: 12, sm: 8 }}>
              <TextInput
                placeholder={`Search in ${categoryTitle}...`}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.currentTarget.value);
                  setCurrentPage(1);
                }}
                leftSection={<IconSearch size={16} color="#9CA3AF" />}
                rightSection={
                  searchQuery ? (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="xs"
                      onClick={() => {
                        setSearchQuery("");
                        setCurrentPage(1);
                      }}
                      aria-label="Clear search"
                    >
                      <IconX size={12} />
                    </ActionIcon>
                  ) : null
                }
                radius="xl"
                size="sm"
              />
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 4 }}>
              <Group gap="xs" justify="flex-end">
                <Select
                  value={sortBy}
                  onChange={(val) => {
                    if (val) {
                      setSortBy(val);
                      setCurrentPage(1);
                    }
                  }}
                  data={[
                    { value: "newest", label: "Newest Arrivals" },
                    { value: "price_asc", label: "Price: Low to High" },
                    { value: "price_desc", label: "Price: High to Low" },
                    { value: "popular", label: "Most Popular" },
                  ]}
                  radius="xl"
                  size="sm"
                  style={{ flex: 1 }}
                />

                <ActionIcon
                  hiddenFrom="md"
                  variant="light"
                  color="primaryPink"
                  size="lg"
                  radius="xl"
                  onClick={openMobileFilter}
                  aria-label="Filter"
                >
                  <IconAdjustmentsHorizontal size={18} />
                </ActionIcon>
              </Group>
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Content Layout */}
        <Grid gap="xl">
          {/* Sidebar */}
          <Grid.Col span={{ base: 12, md: 3 }} visibleFrom="md">
            <Paper
              p="lg"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #F3F4F6",
                boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
                position: "sticky",
                top: 80,
              }}
            >
              <Group justify="space-between" mb="md">
                <Text fw={800} size="md" c={myOxygenColors.darkText}>
                  Filters
                </Text>
                {isFiltered && (
                  <Badge
                    size="xs"
                    variant="light"
                    color="primaryPink"
                    style={{ cursor: "pointer" }}
                    onClick={handleClearFilters}
                  >
                    Reset
                  </Badge>
                )}
              </Group>
              {filterSidebarContent}
            </Paper>
          </Grid.Col>

          {/* Product Grid */}
          <Grid.Col span={{ base: 12, md: 9 }}>
            {isLoading ? (
              <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 3 }} spacing="lg">
                {Array.from({ length: 9 }).map((_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </SimpleGrid>
            ) : isError ? (
              <Paper p="xl" radius="lg" style={{ textAlign: "center", backgroundColor: "#FFFFFF" }}>
                <Text fw={700} c="red" mb="xs">
                  Could not load products for this category
                </Text>
                <Button color="primaryPink" radius="xl" size="xs" onClick={handleClearFilters}>
                  Retry
                </Button>
              </Paper>
            ) : products.length === 0 ? (
              <Paper
                p="3rem"
                radius="lg"
                style={{
                  textAlign: "center",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #F3F4F6",
                }}
              >
                <Box
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "50%",
                    backgroundColor: "#FFF0F3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: myOxygenColors.primaryPink,
                    margin: "0 auto 16px",
                  }}
                >
                  <IconMoodEmpty size={32} />
                </Box>
                <Title order={3} size="h4" c={myOxygenColors.darkText} mb="xs">
                  No products found in {categoryTitle}
                </Title>
                <Text size="sm" c="dimmed" maw={380} mx="auto" mb="lg">
                  There are no products currently matching the selected filters.
                </Text>
                <BrandButton variant="primary" size="sm" radius="xl" onClick={handleClearFilters}>
                  Clear Filters
                </BrandButton>
              </Paper>
            ) : (
              <motion.div variants={staggerContainer} initial="initial" animate="animate">
                <SimpleGrid cols={{ base: 1, xs: 2, sm: 2, md: 3 }} spacing="lg">
                  {products.map((product) => (
                    <motion.div key={product.id} variants={fadeInUp}>
                      <ProductCard
                        id={product.id}
                        title={product.title}
                        slug={product.slug}
                        image={product.images?.[0] || "/placeholder.png"}
                        category={categoryTitle}
                        basePrice={product.basePrice}
                        effectivePrice={product.effectivePrice}
                        requiresBatchTracking={product.requiresBatchTracking}
                        batchExpiry={product.earliestExpiry || undefined}
                        inStock={!product.isOutOfStock && product.totalAvailable > 0}
                        onAddToCart={() => handleAddToCart(product)}
                        onCardClick={() => router.push(`/products/${product.slug || product.id}`)}
                      />
                    </motion.div>
                  ))}
                </SimpleGrid>

                {pagination && pagination.totalPages > 1 && (
                  <Group justify="center" mt="2rem">
                    <Pagination
                      value={currentPage}
                      onChange={setCurrentPage}
                      total={pagination.totalPages}
                      color="primaryPink"
                      radius="xl"
                      size="md"
                    />
                  </Group>
                )}
              </motion.div>
            )}
          </Grid.Col>
        </Grid>
      </Container>

      <Drawer
        opened={mobileFilterOpened}
        onClose={closeMobileFilter}
        title={<Text fw={700}>Filter {categoryTitle}</Text>}
        padding="md"
        position="left"
        size="sm"
      >
        {filterSidebarContent}
        <Button fullWidth color="primaryPink" radius="xl" mt="xl" onClick={closeMobileFilter}>
          Apply Filters
        </Button>
      </Drawer>

      <Footer />
      <MobileBottomNav />
    </Box>
  );
}
