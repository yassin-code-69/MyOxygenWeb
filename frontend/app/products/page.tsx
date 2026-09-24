"use client";

import React, { Suspense, useState, useMemo } from "react";
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
  Checkbox,
  Button,
  SimpleGrid,
  Pagination,
  Group,
  Stack,
  Badge,
  Paper,
  ActionIcon,
  Drawer,
  Collapse,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconSearch,
  IconAdjustmentsHorizontal,
  IconX,
  IconChevronRight,
  IconChevronDown,
  IconLayoutGrid,
  IconList,
  IconSparkles,
  IconMoodKid,
  IconHeartHandshake,
  IconStarFilled,
  IconShirt,
} from "@tabler/icons-react";

import { Navbar } from "../../components/Navbar";
import { Footer } from "../../components/Footer";
import { MobileBottomNav } from "../../components/MobileBottomNav";
import { ProductsHeroBanner } from "../../components/ProductsHeroBanner";
import { CatalogProductCard } from "../../components/CatalogProductCard";
import { CATALOG_PRODUCTS, type CatalogItem } from "../../lib/catalog-data";
import { myOxygenColors } from "../../tokens";

const BRANDS_LIST = [
  { name: "Pampers", count: 24 },
  { name: "Johnson's", count: 18 },
  { name: "Huggies", count: 16 },
  { name: "Aveeno", count: 14 },
  { name: "Cetaphil", count: 12 },
  { name: "Mustela", count: 10 },
  { name: "Simple", count: 8 },
  { name: "Gerber", count: 8 },
];

const RATINGS_FILTER = [
  { stars: 5, label: "5.0 & Up", count: 120 },
  { stars: 4, label: "4.0 & Up", count: 96 },
  { stars: 3, label: "3.0 & Up", count: 58 },
  { stars: 2, label: "2.0 & Up", count: 24 },
  { stars: 1, label: "1.0 & Up", count: 12 },
];

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Filters State
  const initialCategory = searchParams.get("category") || "all";
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategory);
  const [searchQuery, setSearchQuery] = useState(searchParams.get("q") || "");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 10000]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [outOfStockOnly, setOutOfStockOnly] = useState(false);
  const [sortBy, setSortBy] = useState<string>("popular");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Show more brands toggle
  const [showMoreBrands, setShowMoreBrands] = useState(false);

  // Mobile drawer
  const [mobileFilterOpened, { open: openMobileFilter, close: closeMobileFilter }] =
    useDisclosure(false);

  // Category counts
  const categoryCounts = useMemo(() => {
    return {
      all: CATALOG_PRODUCTS.length * 18, // Simulated marketplace scale (324)
      newborn: 72,
      "mother-care": 68,
      "skin-care": 64,
      "inner-wear": 56,
    };
  }, []);

  // Filter & Sort Logic
  const filteredProducts = useMemo(() => {
    let result = [...CATALOG_PRODUCTS];

    // Category
    if (selectedCategory !== "all") {
      result = result.filter((p) => p.categorySlug === selectedCategory);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }

    // Price
    result = result.filter(
      (p) => p.effectivePrice >= priceRange[0] && p.effectivePrice <= priceRange[1]
    );

    // Brands
    if (selectedBrands.length > 0) {
      result = result.filter((p) => selectedBrands.includes(p.brand));
    }

    // Rating
    if (selectedRating !== null) {
      result = result.filter((p) => p.rating >= selectedRating);
    }

    // Stock
    if (inStockOnly && !outOfStockOnly) {
      result = result.filter((p) => p.inStock);
    } else if (outOfStockOnly && !inStockOnly) {
      result = result.filter((p) => !p.inStock);
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === "price_asc") return a.effectivePrice - b.effectivePrice;
      if (sortBy === "price_desc") return b.effectivePrice - a.effectivePrice;
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "newest") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      // "popular" default
      return (b.isPopular ? 1 : 0) - (a.isPopular ? 1 : 0);
    });

    return result;
  }, [
    selectedCategory,
    searchQuery,
    priceRange,
    selectedBrands,
    selectedRating,
    inStockOnly,
    outOfStockOnly,
    sortBy,
  ]);

  // Pagination (12 items per page)
  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const paginatedProducts = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredProducts.slice(startIndex, startIndex + pageSize);
  }, [filteredProducts, currentPage]);

  const handleCategorySelect = (slug: string) => {
    setSelectedCategory(slug);
    setCurrentPage(1);
    closeMobileFilter();
  };

  const handleBrandToggle = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setSelectedCategory("all");
    setSearchQuery("");
    setPriceRange([0, 10000]);
    setSelectedBrands([]);
    setSelectedRating(null);
    setInStockOnly(false);
    setOutOfStockOnly(false);
    setSortBy("popular");
    setCurrentPage(1);
  };

  const isFiltered =
    selectedCategory !== "all" ||
    searchQuery.trim() !== "" ||
    priceRange[0] > 0 ||
    priceRange[1] < 10000 ||
    selectedBrands.length > 0 ||
    selectedRating !== null ||
    inStockOnly ||
    outOfStockOnly;

  // Active Category Name
  const categoryTitle =
    selectedCategory === "all"
      ? "All Products"
      : selectedCategory === "newborn"
      ? "Newborn Care"
      : selectedCategory === "mother-care"
      ? "Mother Care"
      : selectedCategory === "skin-care"
      ? "Skin Care"
      : "Inner Wear";

  // Sidebar Filter Content
  const filterSidebarContent = (
    <Stack gap="xl">
      {/* 1. Categories Section (Matching Mockup with Active Pink Capsule & Chevrons) */}
      <Box>
        <Text fw={800} size="md" c="#1F2937" mb="sm" style={{ letterSpacing: "-0.01em" }}>
          Categories
        </Text>
        <Stack gap={8}>
          {/* All Products */}
          <Box
            onClick={() => handleCategorySelect("all")}
            p="xs"
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              backgroundColor: selectedCategory === "all" ? "#FFF0F3" : "transparent",
              color: selectedCategory === "all" ? "#FF6B8B" : "#4B5563",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <Group gap={10}>
              <IconSparkles
                size={18}
                color={selectedCategory === "all" ? "#FF6B8B" : "#9CA3AF"}
              />
              <Text size="sm" fw={selectedCategory === "all" ? 700 : 500}>
                All Products
              </Text>
            </Group>
            <Group gap={4}>
              <Text size="xs" fw={selectedCategory === "all" ? 700 : 500} c={selectedCategory === "all" ? "#FF6B8B" : "#9CA3AF"}>
                ({categoryCounts.all})
              </Text>
              <IconChevronRight
                size={14}
                color={selectedCategory === "all" ? "#FF6B8B" : "#D1D5DB"}
              />
            </Group>
          </Box>

          {/* Newborn */}
          <Box
            onClick={() => handleCategorySelect("newborn")}
            p="xs"
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              backgroundColor: selectedCategory === "newborn" ? "#FFF0F3" : "transparent",
              color: selectedCategory === "newborn" ? "#FF6B8B" : "#4B5563",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <Group gap={10}>
              <IconMoodKid
                size={18}
                color={selectedCategory === "newborn" ? "#FF6B8B" : "#9CA3AF"}
              />
              <Text size="sm" fw={selectedCategory === "newborn" ? 700 : 500}>
                Newborn
              </Text>
            </Group>
            <Group gap={4}>
              <Text size="xs" fw={selectedCategory === "newborn" ? 700 : 500} c={selectedCategory === "newborn" ? "#FF6B8B" : "#9CA3AF"}>
                ({categoryCounts.newborn})
              </Text>
              <IconChevronRight
                size={14}
                color={selectedCategory === "newborn" ? "#FF6B8B" : "#D1D5DB"}
              />
            </Group>
          </Box>

          {/* Mother Care */}
          <Box
            onClick={() => handleCategorySelect("mother-care")}
            p="xs"
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              backgroundColor: selectedCategory === "mother-care" ? "#FFF0F3" : "transparent",
              color: selectedCategory === "mother-care" ? "#FF6B8B" : "#4B5563",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <Group gap={10}>
              <IconHeartHandshake
                size={18}
                color={selectedCategory === "mother-care" ? "#FF6B8B" : "#9CA3AF"}
              />
              <Text size="sm" fw={selectedCategory === "mother-care" ? 700 : 500}>
                Mother Care
              </Text>
            </Group>
            <Group gap={4}>
              <Text size="xs" fw={selectedCategory === "mother-care" ? 700 : 500} c={selectedCategory === "mother-care" ? "#FF6B8B" : "#9CA3AF"}>
                ({categoryCounts["mother-care"]})
              </Text>
              <IconChevronRight
                size={14}
                color={selectedCategory === "mother-care" ? "#FF6B8B" : "#D1D5DB"}
              />
            </Group>
          </Box>

          {/* Skin Care */}
          <Box
            onClick={() => handleCategorySelect("skin-care")}
            p="xs"
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              backgroundColor: selectedCategory === "skin-care" ? "#FFF0F3" : "transparent",
              color: selectedCategory === "skin-care" ? "#FF6B8B" : "#4B5563",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <Group gap={10}>
              <IconSparkles
                size={18}
                color={selectedCategory === "skin-care" ? "#FF6B8B" : "#9CA3AF"}
              />
              <Text size="sm" fw={selectedCategory === "skin-care" ? 700 : 500}>
                Skin Care
              </Text>
            </Group>
            <Group gap={4}>
              <Text size="xs" fw={selectedCategory === "skin-care" ? 700 : 500} c={selectedCategory === "skin-care" ? "#FF6B8B" : "#9CA3AF"}>
                ({categoryCounts["skin-care"]})
              </Text>
              <IconChevronRight
                size={14}
                color={selectedCategory === "skin-care" ? "#FF6B8B" : "#D1D5DB"}
              />
            </Group>
          </Box>

          {/* Inner Wear */}
          <Box
            onClick={() => handleCategorySelect("inner-wear")}
            p="xs"
            style={{
              cursor: "pointer",
              borderRadius: "12px",
              backgroundColor: selectedCategory === "inner-wear" ? "#FFF0F3" : "transparent",
              color: selectedCategory === "inner-wear" ? "#FF6B8B" : "#4B5563",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              transition: "all 0.15s ease",
            }}
          >
            <Group gap={10}>
              <IconShirt
                size={18}
                color={selectedCategory === "inner-wear" ? "#FF6B8B" : "#9CA3AF"}
              />
              <Text size="sm" fw={selectedCategory === "inner-wear" ? 700 : 500}>
                Inner Wear
              </Text>
            </Group>
            <Group gap={4}>
              <Text size="xs" fw={selectedCategory === "inner-wear" ? 700 : 500} c={selectedCategory === "inner-wear" ? "#FF6B8B" : "#9CA3AF"}>
                ({categoryCounts["inner-wear"]})
              </Text>
              <IconChevronRight
                size={14}
                color={selectedCategory === "inner-wear" ? "#FF6B8B" : "#D1D5DB"}
              />
            </Group>
          </Box>
        </Stack>
      </Box>

      {/* 2. Price Range Slider & Input Badges */}
      <Box>
        <Text fw={800} size="md" c="#1F2937" mb="xs">
          Price Range
        </Text>
        <RangeSlider
          min={0}
          max={10000}
          step={50}
          value={priceRange}
          onChange={(val) => {
            setPriceRange(val);
            setCurrentPage(1);
          }}
          color="pink"
          size="sm"
          styles={{
            bar: { backgroundColor: "#FF6B8B" },
            thumb: { borderColor: "#FF6B8B", backgroundColor: "#FFFFFF" },
          }}
          mb="sm"
        />
        <Group justify="space-between" align="center">
          <Box
            px="sm"
            py={6}
            style={{
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              minWidth: 80,
              textAlign: "center",
            }}
          >
            <Text size="xs" fw={600} c="#4B5563">
              ৳ {priceRange[0].toLocaleString()}
            </Text>
          </Box>
          <Text size="xs" c="#9CA3AF">
            to
          </Text>
          <Box
            px="sm"
            py={6}
            style={{
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: "8px",
              minWidth: 80,
              textAlign: "center",
            }}
          >
            <Text size="xs" fw={600} c="#4B5563">
              ৳ {priceRange[1].toLocaleString()}+
            </Text>
          </Box>
        </Group>
      </Box>

      {/* 3. Brand Filter Checkboxes */}
      <Box>
        <Text fw={800} size="md" c="#1F2937" mb="sm">
          Brand
        </Text>
        <Stack gap={8}>
          {BRANDS_LIST.slice(0, showMoreBrands ? BRANDS_LIST.length : 5).map((brand) => (
            <Group key={brand.name} justify="space-between" align="center">
              <Checkbox
                label={brand.name}
                checked={selectedBrands.includes(brand.name)}
                onChange={() => handleBrandToggle(brand.name)}
                color="pink"
                size="xs"
                styles={{
                  label: {
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "#374151",
                    cursor: "pointer",
                  },
                }}
              />
              <Text size="xs" c="#9CA3AF">
                ({brand.count})
              </Text>
            </Group>
          ))}
        </Stack>

        <Anchor
          component="button"
          type="button"
          size="xs"
          c="#FF6B8B"
          fw={600}
          mt={10}
          onClick={() => setShowMoreBrands(!showMoreBrands)}
          style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          {showMoreBrands ? "View Less ^" : "View More v"}
        </Anchor>
      </Box>

      {/* 4. Ratings Filter */}
      <Box>
        <Text fw={800} size="md" c="#1F2937" mb="sm">
          Ratings
        </Text>
        <Stack gap={8}>
          {RATINGS_FILTER.map((r) => {
            const isSelected = selectedRating === r.stars;
            return (
              <Box
                key={r.stars}
                onClick={() => {
                  setSelectedRating(isSelected ? null : r.stars);
                  setCurrentPage(1);
                }}
                p="4px 8px"
                style={{
                  cursor: "pointer",
                  borderRadius: "8px",
                  backgroundColor: isSelected ? "#FFF0F3" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Group gap={6} align="center">
                  <Group gap={2}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <IconStarFilled
                        key={i}
                        size={14}
                        color={i < r.stars ? "#F59E0B" : "#E5E7EB"}
                      />
                    ))}
                  </Group>
                  <Text size="xs" fw={isSelected ? 700 : 500} c={isSelected ? "#FF6B8B" : "#4B5563"}>
                    & Up
                  </Text>
                </Group>
                <Text size="xs" c="#9CA3AF">
                  ({r.count})
                </Text>
              </Box>
            );
          })}
        </Stack>
      </Box>

      {/* 5. Availability Filter */}
      <Box>
        <Text fw={800} size="md" c="#1F2937" mb="sm">
          Availability
        </Text>
        <Stack gap={8}>
          <Group justify="space-between" align="center">
            <Checkbox
              label="In Stock"
              checked={inStockOnly}
              onChange={(e) => {
                setInStockOnly(e.currentTarget.checked);
                if (e.currentTarget.checked) setOutOfStockOnly(false);
                setCurrentPage(1);
              }}
              color="pink"
              size="xs"
              styles={{
                label: { fontSize: "13px", fontWeight: 500, color: "#374151" },
              }}
            />
            <Text size="xs" c="#9CA3AF">
              (286)
            </Text>
          </Group>

          <Group justify="space-between" align="center">
            <Checkbox
              label="Out of Stock"
              checked={outOfStockOnly}
              onChange={(e) => {
                setOutOfStockOnly(e.currentTarget.checked);
                if (e.currentTarget.checked) setInStockOnly(false);
                setCurrentPage(1);
              }}
              color="pink"
              size="xs"
              styles={{
                label: { fontSize: "13px", fontWeight: 500, color: "#374151" },
              }}
            />
            <Text size="xs" c="#9CA3AF">
              (38)
            </Text>
          </Group>
        </Stack>
      </Box>

      {/* Reset Filters CTA */}
      {isFiltered && (
        <Button
          variant="light"
          color="pink"
          size="xs"
          radius="xl"
          fullWidth
          onClick={handleClearFilters}
          leftSection={<IconX size={14} />}
        >
          Reset All Filters
        </Button>
      )}
    </Stack>
  );

  return (
    <Box style={{ minHeight: "100vh", backgroundColor: "#FFF8F6", paddingBottom: 0 }}>
      <Navbar />

      <Container size="xl" py="lg">
        {/* Breadcrumb Navigation */}
        <Breadcrumbs
          separator={<IconChevronRight size={13} color="#9CA3AF" />}
          mb="md"
        >
          <Anchor component={Link} href="/" size="xs" c="#6B7280" style={{ textDecoration: "none" }}>
            Home
          </Anchor>
          <Text size="xs" fw={600} c="#FF6B8B">
            Products
          </Text>
          {selectedCategory !== "all" && (
            <Text size="xs" fw={600} c="#4B5563">
              {categoryTitle}
            </Text>
          )}
        </Breadcrumbs>

        {/* 1. Top Products Hero Banner (Matching Mockup) */}
        <ProductsHeroBanner categoryTitle={categoryTitle} />

        {/* 2. Main Content Layout (Sidebar + Product Grid) */}
        <Grid gap="xl">
          {/* Left Filter Sidebar (Desktop) */}
          <Grid.Col span={{ base: 12, md: 3 }} visibleFrom="md">
            <Paper
              p="xl"
              radius="lg"
              style={{
                backgroundColor: "#FFFFFF",
                border: "1px solid #FFE4EC",
                borderRadius: "20px",
                boxShadow: "0 4px 20px rgba(255, 107, 139, 0.04)",
                position: "sticky",
                top: 90,
              }}
            >
              {filterSidebarContent}
            </Paper>
          </Grid.Col>

          {/* Right Product Grid Area */}
          <Grid.Col span={{ base: 12, md: 9 }}>
            {/* Top Toolbar (Product count + Sort dropdown + Grid/List view) */}
            <Group justify="space-between" align="center" mb="lg" wrap="wrap" gap="md">
              {/* Product Title and Found Count */}
              <Box>
                <Title
                  order={2}
                  style={{
                    fontFamily: "var(--font-poppins), sans-serif",
                    color: "#1F2937",
                    fontSize: "1.65rem",
                    fontWeight: 800,
                  }}
                >
                  {categoryTitle}
                </Title>
                <Text size="xs" c="#6B7280" fw={500} mt={2}>
                  {filteredProducts.length} products found
                </Text>
              </Box>

              {/* Controls: Search, Sort by, View Mode, Mobile Filter Toggle */}
              <Group gap="xs">
                {/* Search Bar */}
                <TextInput
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.currentTarget.value);
                    setCurrentPage(1);
                  }}
                  leftSection={<IconSearch size={15} color="#9CA3AF" />}
                  rightSection={
                    searchQuery ? (
                      <ActionIcon
                        variant="subtle"
                        size="xs"
                        onClick={() => setSearchQuery("")}
                      >
                        <IconX size={12} />
                      </ActionIcon>
                    ) : null
                  }
                  radius="xl"
                  size="xs"
                  style={{ width: 170 }}
                />

                {/* Sort Dropdown */}
                <Select
                  value={sortBy}
                  onChange={(val) => {
                    if (val) setSortBy(val);
                  }}
                  data={[
                    { value: "popular", label: "Sort by: Popular" },
                    { value: "price_asc", label: "Price: Low to High" },
                    { value: "price_desc", label: "Price: High to Low" },
                    { value: "rating", label: "Top Rated" },
                    { value: "newest", label: "Newest Arrivals" },
                  ]}
                  radius="xl"
                  size="xs"
                  style={{ width: 160 }}
                  styles={{
                    input: {
                      borderColor: "#FFE4EC",
                      fontWeight: 600,
                      color: "#374151",
                    },
                  }}
                />

                {/* Grid View Toggle */}
                <ActionIcon
                  variant={viewMode === "grid" ? "filled" : "default"}
                  color={viewMode === "grid" ? "pink" : "gray"}
                  radius="md"
                  size="md"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid View"
                  style={{
                    backgroundColor: viewMode === "grid" ? "#FFF0F3" : "#FFFFFF",
                    borderColor: viewMode === "grid" ? "#FF6B8B" : "#E5E7EB",
                    color: viewMode === "grid" ? "#FF6B8B" : "#6B7280",
                  }}
                >
                  <IconLayoutGrid size={17} />
                </ActionIcon>

                {/* List View Toggle */}
                <ActionIcon
                  variant={viewMode === "list" ? "filled" : "default"}
                  color={viewMode === "list" ? "pink" : "gray"}
                  radius="md"
                  size="md"
                  onClick={() => setViewMode("list")}
                  aria-label="List View"
                  style={{
                    backgroundColor: viewMode === "list" ? "#FFF0F3" : "#FFFFFF",
                    borderColor: viewMode === "list" ? "#FF6B8B" : "#E5E7EB",
                    color: viewMode === "list" ? "#FF6B8B" : "#6B7280",
                  }}
                >
                  <IconList size={17} />
                </ActionIcon>

                {/* Mobile Filter Toggle (Visible on Mobile Only) */}
                <ActionIcon
                  hiddenFrom="md"
                  variant="filled"
                  radius="xl"
                  size="md"
                  onClick={openMobileFilter}
                  style={{ backgroundColor: "#FF6B8B" }}
                  aria-label="Open filter sidebar"
                >
                  <IconAdjustmentsHorizontal size={18} color="#FFFFFF" />
                </ActionIcon>
              </Group>
            </Group>

            {/* Product Cards (4 Columns on Desktop matching Mockup) */}
            {paginatedProducts.length > 0 ? (
              <SimpleGrid
                cols={
                  viewMode === "grid"
                    ? { base: 2, sm: 2, md: 3, lg: 4 }
                    : { base: 1, sm: 1, md: 1 }
                }
                spacing={{ base: "xs", sm: "md", md: "md" }}
                verticalSpacing={{ base: "sm", sm: "md", md: "lg" }}
              >
                {paginatedProducts.map((product) => (
                  <CatalogProductCard key={product.id} product={product} />
                ))}
              </SimpleGrid>
            ) : (
              <Paper
                p="xl"
                radius="lg"
                style={{
                  textAlign: "center",
                  backgroundColor: "#FFFFFF",
                  border: "1px solid #FFE4EC",
                  borderRadius: "16px",
                  padding: "60px 20px",
                }}
              >
                <Text fw={700} size="lg" c="#1F2937" mb="xs">
                  No products found
                </Text>
                <Text size="sm" c="#6B7280" mb="lg">
                  Try adjusting your search or filter settings to find what you are looking for.
                </Text>
                <Button
                  variant="light"
                  color="pink"
                  radius="xl"
                  onClick={handleClearFilters}
                >
                  Clear All Filters
                </Button>
              </Paper>
            )}

            {/* 3. Centered Pagination Bar (Matching Mockup with Pink Active Bubble) */}
            {totalPages > 1 && (
              <Group justify="center" mt={48}>
                <Pagination
                  total={totalPages}
                  value={currentPage}
                  onChange={setCurrentPage}
                  radius="xl"
                  color="pink"
                  styles={{
                    control: {
                      border: "1px solid #FFE4EC",
                      color: "#4B5563",
                      fontWeight: 600,
                      "&[dataActive]": {
                        backgroundColor: "#FF4D6D !important",
                        borderColor: "#FF4D6D !important",
                        color: "#FFFFFF !important",
                      },
                    },
                  }}
                />
              </Group>
            )}
          </Grid.Col>
        </Grid>
      </Container>

      {/* Mobile Filters Drawer */}
      <Drawer
        opened={mobileFilterOpened}
        onClose={closeMobileFilter}
        title={
          <Text fw={800} size="lg" c="#1F2937">
            Filters
          </Text>
        }
        padding="md"
        size="md"
        position="left"
        styles={{
          header: { borderBottom: "1px solid #FFE4EC" },
        }}
      >
        <Box py="sm">{filterSidebarContent}</Box>
      </Drawer>

      <Footer mt={48} showAccentStrip />
      <MobileBottomNav />
    </Box>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <Box style={{ minHeight: "100vh", backgroundColor: "#FFF8F6" }}>
          <Navbar />
          <Container size="xl" py={60} style={{ textAlign: "center" }}>
            <Text c="dimmed">Loading products...</Text>
          </Container>
          <Footer />
        </Box>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
