"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Container,
  Title,
  Group,
  Text,
  SimpleGrid,
  Card,
  Image,
  ActionIcon,
  Button,
  Rating,
  Box,
} from "@mantine/core";
import { IconHeart, IconArrowRight } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";
import { useCartStore } from "../lib/cart-store";
import { notifications } from "@mantine/notifications";

interface MockProduct {
  id: string;
  title: string;
  category: string;
  categorySlug: string;
  price: number;
  rating: number;
  reviewsCount: number;
  image: string;
}

const mockFeaturedProducts: MockProduct[] = [
  {
    id: "prod-diaper-1",
    title: "Baby Diaper",
    category: "Newborn",
    categorySlug: "newborn",
    price: 850,
    rating: 4.8,
    reviewsCount: 124,
    image: "/images/prod-diaper.svg",
  },
  {
    id: "prod-vitamin-2",
    title: "Pregnancy Vitamin",
    category: "Mother Care",
    categorySlug: "mother-care",
    price: 1250,
    rating: 4.9,
    reviewsCount: 98,
    image: "/images/prod-vitamins.svg",
  },
  {
    id: "prod-facewash-3",
    title: "Face Wash (Skin Care)",
    category: "Skin Care",
    categorySlug: "skin-care",
    price: 650,
    rating: 4.7,
    reviewsCount: 76,
    image: "/images/prod-facewash.svg",
  },
  {
    id: "prod-bra-4",
    title: "Comfort Bra",
    category: "Inner Wear",
    categorySlug: "inner-wear",
    price: 1100,
    rating: 4.9,
    reviewsCount: 87,
    image: "/images/prod-bra.jpg",
  },
];

const categoryTabs = ["Newborn", "Mother Care", "Skin Care", "Inner Wear"];

export function FeaturedProducts() {
  const [activeTab, setActiveTab] = useState<string>("Newborn");
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});
  const addItem = useCartStore((state) => state.addItem);

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAddToCart = (prod: MockProduct) => {
    addItem({
      id: prod.id,
      title: prod.title,
      slug: prod.id,
      unitPrice: prod.price,
      image: prod.image,
    });
    notifications.show({
      title: "Added to Cart",
      message: `${prod.title} (৳ ${prod.price.toLocaleString()}) has been added.`,
      color: "pink",
    });
  };

  return (
    <Box py={{ base: 35, md: 55 }} style={{ backgroundColor: "#FFF8F6" }}>
      <Container size="xl">
        {/* Section Heading & Category Tabs */}
        <Group justify="space-between" align="center" mb="xl" wrap="wrap" gap="md">
          <Group gap="lg" align="center" wrap="wrap">
            <Title
              order={2}
              style={{
                fontSize: "1.75rem",
                fontWeight: 800,
                color: myOxygenColors.darkText,
                fontFamily: "var(--font-poppins)",
              }}
            >
              Featured Products
            </Title>

            {/* Category Filter Pills matching mockup */}
            <Group gap="xs" wrap="wrap">
              {categoryTabs.map((cat) => {
                const isActive = activeTab === cat;
                return (
                  <Button
                    key={cat}
                    size="xs"
                    radius="xl"
                    variant={isActive ? "filled" : "subtle"}
                    color={isActive ? "primaryPink" : "gray"}
                    onClick={() => setActiveTab(cat)}
                    fw={isActive ? 700 : 500}
                    style={{
                      backgroundColor: isActive ? myOxygenColors.primaryPink : "transparent",
                      color: isActive ? "#FFFFFF" : myOxygenColors.textGray,
                      padding: "0 14px",
                      height: 30,
                      transition: "all 0.2s ease",
                    }}
                  >
                    {cat}
                  </Button>
                );
              })}
            </Group>
          </Group>

          {/* View All Link */}
          <Link
            href="/products"
            style={{
              textDecoration: "none",
              color: myOxygenColors.primaryPink,
              fontWeight: 700,
              fontSize: "0.88rem",
            }}
          >
            <Group gap={4}>
              <Text inherit>View All</Text>
              <IconArrowRight size={16} stroke={2.5} />
            </Group>
          </Link>
        </Group>

        {/* 4 Products Grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
          {mockFeaturedProducts.map((prod) => {
            const isLiked = wishlist[prod.id] || false;

            return (
              <Card
                key={prod.id}
                padding="md"
                radius={20}
                style={{
                  border: "1px solid #FFE4EC",
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 4px 20px rgba(255, 107, 139, 0.05)",
                  position: "relative",
                  transition: "transform 0.25s ease, box-shadow 0.25s ease",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                {/* Product Image Container */}
                <Box
                  style={{
                    position: "relative",
                    height: 200,
                    borderRadius: 16,
                    overflow: "hidden",
                    backgroundColor: "#FFF9FA",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    src={prod.image}
                    alt={prod.title}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    }}
                  />

                  {/* Wishlist Heart Icon */}
                  <ActionIcon
                    variant="filled"
                    radius="xl"
                    size="md"
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      backgroundColor: "#FFFFFF",
                      color: isLiked ? myOxygenColors.primaryPink : "#9CA3AF",
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
                    }}
                    onClick={() => toggleWishlist(prod.id)}
                    aria-label="Save to Wishlist"
                  >
                    <IconHeart
                      size={16}
                      fill={isLiked ? myOxygenColors.primaryPink : "none"}
                    />
                  </ActionIcon>
                </Box>

                {/* Product Details */}
                <Box mt="md" style={{ flexGrow: 1 }}>
                  <Text
                    fw={700}
                    size="sm"
                    c={myOxygenColors.darkText}
                    style={{ fontFamily: "var(--font-poppins)", minHeight: 20 }}
                    lineClamp={1}
                  >
                    {prod.title}
                  </Text>

                  <Text fw={800} size="md" c={myOxygenColors.darkText} mt={4}>
                    ৳ {prod.price.toLocaleString()}
                  </Text>

                  {/* Star Rating and Review Count */}
                  <Group gap={6} align="center" mt={4}>
                    <Rating
                      value={prod.rating}
                      fractions={2}
                      readOnly
                      size="xs"
                      color="yellow"
                    />
                    <Text size="xs" c="dimmed">
                      ({prod.reviewsCount})
                    </Text>
                  </Group>

                  {/* Add to Cart Button (Solid pink pill matching mockup) */}
                  <Button
                    fullWidth
                    radius="xl"
                    size="sm"
                    mt="md"
                    onClick={() => handleAddToCart(prod)}
                    style={{
                      backgroundColor: myOxygenColors.primaryPink,
                      color: "#FFFFFF",
                      fontWeight: 700,
                      height: 38,
                      boxShadow: "0 4px 14px rgba(255, 107, 139, 0.35)",
                      transition: "transform 0.15s ease",
                    }}
                  >
                    Add to Cart
                  </Button>
                </Box>
              </Card>
            );
          })}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
