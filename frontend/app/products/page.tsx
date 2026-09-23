"use client";

import React, { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Loader,
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
} from "@tabler/icons-react";
import { motion } from "motion/react";

import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import { MobileBottomNav } from "../../components/MobileBottomNav";
import { ProductCard } from "../../components/ProductCard";
import { ProductCardSkeleton } from "../../components/ProductCardSkeleton";
import { BrandButton } from "../../components/BrandButton";
import { useProducts } from "../../hooks/use-products";
import { useCartStore } from "../../lib/cart-store";
import { coreCategories } from "../../tokens/categories";
import { myOxygenColors } from "../../tokens";
import { staggerContainer, fadeInUp } from "../../lib/animations";
import type { CatalogProductItem } from "../../types";

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL state initializers
  const initialQ = searchParams.get("q") || "";
  const initialCategory = searchParams.get("category") || "all";
  const initialSort = searchParams.get("sort") || "newest";

  const [searchQuery, setSearchQuery] = useState(initialQ);
  const [debouncedSearch] = useDebouncedValue(searchQuery, 350);
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 5000]);
  const [debouncedPriceRange] = useDebouncedValue(priceRange, 300);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>(initialSort);
  const [currentPage, setCurrentPage] = useState(1);

  // Mobile filter drawer
  const [mobileFilterOpened, { open: openMobileFilter, close: closeMobileFilter }] =
    useDisclosure(false);

  const addItem = useCartStore((state) => state.addItem);

  // Update query when debounced values or filters change
  const { products, pagination, isLoading, isError } = useProducts({
    q: debouncedSearch,
    categorySlug: selectedCategory !== "all" ? selectedCategory : undefined,
    minPrice: debouncedPriceRange[0] > 0 ? debouncedPriceRange[0] : undefined,
    maxPrice: debouncedPriceRange[1] < 5000 ? debouncedPriceRange[1] : undefined,
    inStockOnly,
    sort: sortBy,
    page: currentPage,
    limit: 12,
  });

  // Sync category or query changes from URL
  useEffect(() => {
    const q = searchParams.get("q");
    if (q !== null && q !== searchQuery) setSearchQuery(q);
    const cat = searchParams.get("category");
    if (cat !== null && cat !== selectedCategory) setSelectedCategory(cat);
  }, [searchParams]);

  // Reset page to 1 when filters change
  const handleCategorySelect = (slug: string) => {
    setSelectedCategory(slug);
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setPriceRange([0, 5000]);
    setInStockOnly(false);
    setSortBy("newest");
    setCurrentPage(1);
  };

  const isFiltered =
    searchQuery.trim() !== "" ||
    selectedCategory !== "all" ||
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
      {/* Categories */}
      <Box>
        <Text fw={700} size="sm" c={myOxygenColors.darkText} mb="xs">
          Category
        </Text>
        <Stack gap={6}>
          <Paper
            p="xs"
            radius="md"
            onClick={() => handleCategorySelect("all")}
            style={{
              cursor: "pointer",
              backgroundColor: selectedCategory === "all" ? "#FFF0F3" : "#FFFFFF",
              border: `1px solid ${selectedCategory === "all" ? myOxygenColors.primaryPink : "#E5E7EB"}`,
              transition: "all 0.2s ease",
            }}
          >
            <Group justify="space-between">
              <Text
                size="sm"
                fw={selectedCategory === "all" ? 700 : 500}
                c={selectedCategory === "all" ? myOxygenColors.primaryPink : myOxygenColors.darkText}
              >
                All Categories
              </Text>
            </Group>
          </Paper>

          {coreCategories.map((cat) => {
            const isSelected = selectedCategory === cat.slug;
            return (
              <Paper
                key={cat.slug}
                p="xs"
                radius="md"
                onClick={() => handleCategorySelect(cat.slug)}
                style={{
                  cursor: "pointer",
                  backgroundColor: isSelected ? "#FFF0F3" : "#FFFFFF",
                  border: `1px solid ${isSelected ? myOxygenColors.primaryPink : "#E5E7EB"}`,
                  transition: "all 0.2s ease",
                }}
              >
                <Group justify="space-between">
                  <Text
                    size="sm"
                    fw={isSelected ? 700 : 500}
                    c={isSelected ? myOxygenColors.primaryPink : myOxygenColors.darkText}
                  >
                    {cat.name}
                  </Text>
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </Box>

      {/* Price Range Slider */}
      <Box>
        <Group justify="space-between" mb={8}>
          <Text fw={700} size="sm" c={myOxygenColors.darkText}>
            Price Range
          </Text>
          <Text size="xs" fw={600} c={myOxygenColors.primaryPink}>
            ৳{priceRange[0].toLocaleString()} - ৳{priceRange[1].toLocaleString()}
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

      {/* In Stock Only Switch */}
      <Box>
        <Switch
          label="In Stock Only"
          checked={inStockOnly}
          onChange={(event) => {
            setInStockOnly(event.currentTarget.checked);
            setCurrentPage(1);
          }}
          color="primaryPink"
          styles={{
            label: {
              fontWeight: 600,
              fontSize: "14px",
              color: myOxygenColors.darkText,
              cursor: "pointer",
            },
          }}
        />
      </Box>

      {/* Clear Filters */}
      {isFiltered && (
        <Button
          variant="light"
          color="gray"
          size="xs"
          radius="xl"
          onClick={handleClearFilters}
          leftSection={<IconX size={14} />}
        >
          Clear All Filters
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
          <Text size="xs" fw={600} c={myOxygenColors.primaryPink}>
            Products
          </Text>
          {selectedCategory !== "all" && (
            <Text size="xs" fw={600} c="dimmed">
              {coreCategories.find((c) => c.slug === selectedCategory)?.name || selectedCategory}
            </Text>
          )}
        </Breadcrumbs>

        {/* Top Header & Search Controls */}
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
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Title
                order={2}
                style={{
                  fontFamily: "var(--font-poppins)",
                  color: myOxygenColors.darkText,
                  fontSize: "1.6rem",
                }}
              >
                {selectedCategory === "all"
                  ? "All Catalog Products"
                  : coreCategories.find((c) => c.slug === selectedCategory)?.name || "Products"}
              </Title>
              {pagination && (
                <Text size="xs" c="dimmed" mt={2}>
                  Showing {products.length} of {pagination.total} items
                </Text>
              )}
            </Grid.Col>

            <Grid.Col span={{ base: 12, sm: 8, md: 5 }}>
              <TextInput
                placeholder="Search products by title, formula, or keyword..."
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

            <Grid.Col span={{ base: 12, sm: 4, md: 3 }}>
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

                {/* Mobile Filter Toggle */}
                <ActionIcon
                  hiddenFrom="md"
                  variant="light"
                  color="primaryPink"
                  size="lg"
                  radius="xl"
                  onClick={openMobileFilter}
                  aria-label="Open filter sidebar"
                >
                  <IconAdjustmentsHorizontal size={18} />
                </ActionIcon>
              </Group>
            </Grid.Col>
          </Grid>
        </Paper>

        {/* Main Content Layout */}
        <Grid gap="xl">
          {/* Desktop Filter Sidebar */}
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

          {/* Product Grid Area */}
          <Grid.Col span={{ base: 12, md: 9 }}>
            {isLoading ? (
              <SimpleGrid cols={{ base: 2, sm: 2, md: 3 }} spacing={{ base: "xs", sm: "md", md: "lg" }}>
                {Array.from({ length: 8 }).map((_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </SimpleGrid>
            ) : isError ? (
              <Paper
                p="xl"
                radius="lg"
                style={{
                  textAlign: "center",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #FEE2E2",
                }}
              >
                <Text fw={700} c="red" mb="xs">
                  Failed to load catalog products
                </Text>
                <Text size="sm" c="dimmed" mb="md">
                  Please verify your connection to the server.
                </Text>
                <Button
                  color="primaryPink"
                  radius="xl"
                  size="xs"
                  onClick={() => handleClearFilters()}
                >
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
                  No products match your filters
                </Title>
                <Text size="sm" c="dimmed" maw={380} mx="auto" mb="lg">
                  Try clearing your search query or selecting a broader category and price range.
                </Text>
                <BrandButton
                  variant="primary"
                  size="sm"
                  radius="xl"
                  onClick={handleClearFilters}
                >
                  Clear All Filters
                </BrandButton>
              </Paper>
            ) : (
              <motion.div
                variants={staggerContainer}
                initial="initial"
                animate="animate"
              >
                <SimpleGrid cols={{ base: 2, sm: 2, md: 3 }} spacing={{ base: "xs", sm: "md", md: "lg" }}>
                  {products.map((product) => {
                    const categoryObj = coreCategories.find((c) => c.slug === product.categoryId);
                    const categoryLabel = categoryObj?.name || product.categoryId;

                    return (
                      <motion.div key={product.id} variants={fadeInUp}>
                        <ProductCard
                          id={product.id}
                          title={product.title}
                          slug={product.slug}
                          image={product.images?.[0] || "/placeholder.png"}
                          category={categoryLabel}
                          basePrice={product.basePrice}
                          effectivePrice={product.effectivePrice}
                          requiresBatchTracking={product.requiresBatchTracking}
                          batchExpiry={product.earliestExpiry || undefined}
                          inStock={!product.isOutOfStock && product.totalAvailable > 0}
                          onAddToCart={() => handleAddToCart(product)}
                          onCardClick={() => router.push(`/products/${product.slug || product.id}`)}
                        />
                      </motion.div>
                    );
                  })}
                </SimpleGrid>

                {/* Pagination Controls */}
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

      {/* Mobile Filters Drawer */}
      <Drawer
        opened={mobileFilterOpened}
        onClose={closeMobileFilter}
        title={
          <Text fw={700} size="md">
            Filter Products
          </Text>
        }
        padding="md"
        position="left"
        size="sm"
      >
        {filterSidebarContent}
        <Button
          fullWidth
          color="primaryPink"
          radius="xl"
          mt="xl"
          onClick={closeMobileFilter}
        >
          Apply Filters
        </Button>
      </Drawer>

      <Footer />
      <MobileBottomNav />
    </Box>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <Box style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Loader color="primaryPink" />
        </Box>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
