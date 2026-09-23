"use client";

import { useState } from "react";
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
  Badge,
} from "@mantine/core";
import { IconHeart, IconShoppingCart } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

const sampleProducts = [
  {
    id: "1",
    title: "Ultra Soft Baby Diaper (Pants)",
    category: "Newborn",
    price: "850",
    rating: 4.9,
    reviewsCount: 124,
    image: "https://images.unsplash.com/photo-1515488042361-ee00e0ddd4e4?w=600&auto=format&fit=crop&q=80",
    inStock: true,
  },
  {
    id: "2",
    title: "Complete Pregnancy Multivitamin",
    category: "Mother Care",
    price: "1,250",
    rating: 4.8,
    reviewsCount: 98,
    image: "https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&auto=format&fit=crop&q=80",
    inStock: true,
  },
  {
    id: "3",
    title: "Natural Hydrating Face Wash",
    category: "Skin Care",
    price: "650",
    rating: 4.7,
    reviewsCount: 210,
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop&q=80",
    inStock: true,
  },
  {
    id: "4",
    title: "Seamless Comfort Nursing Bra",
    category: "Inner Wear",
    price: "1,100",
    rating: 4.9,
    reviewsCount: 87,
    image: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=600&auto=format&fit=crop&q=80",
    inStock: true,
  },
];

const categoriesList = ["All", "Newborn", "Mother Care", "Skin Care", "Inner Wear"];

export function FeaturedProducts() {
  const [activeTab, setActiveTab] = useState("All");
  const [wishlist, setWishlist] = useState<Record<string, boolean>>({});

  const toggleWishlist = (id: string) => {
    setWishlist((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const filteredProducts =
    activeTab === "All"
      ? sampleProducts
      : sampleProducts.filter((p) => p.category === activeTab);

  return (
    <Box py={{ base: 40, md: 60 }} style={{ backgroundColor: "#FFFFFF" }}>
      <Container size="xl">
        <Group justify="space-between" align="center" mb="lg">
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

          {/* Category Filter Chips */}
          <Group gap="xs" wrap="wrap">
            {categoriesList.map((cat) => (
              <Button
                key={cat}
                size="xs"
                radius="xl"
                variant={activeTab === cat ? "filled" : "subtle"}
                color={activeTab === cat ? "primaryPink" : "gray"}
                onClick={() => setActiveTab(cat)}
                fw={600}
              >
                {cat}
              </Button>
            ))}
          </Group>
        </Group>

        {/* Product Cards Grid */}
        <SimpleGrid cols={{ base: 2, sm: 2, md: 4 }} spacing={{ base: "xs", sm: "md", md: "lg" }}>
          {filteredProducts.map((prod) => {
            const isLiked = wishlist[prod.id] || false;

            return (
              <Card
                key={prod.id}
                padding="md"
                radius="lg"
                style={{
                  border: "1px solid #F3F4F6",
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 4px 15px rgba(0, 0, 0, 0.03)",
                  position: "relative",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                }}
              >
                {/* Product Image Container with Wishlist Icon */}
                <Box
                  style={{
                    position: "relative",
                    height: 200,
                    borderRadius: "12px",
                    overflow: "hidden",
                    backgroundColor: "#F9FAFB",
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
                  <ActionIcon
                    variant="filled"
                    color={isLiked ? "red" : "white"}
                    c={isLiked ? "white" : "gray"}
                    radius="xl"
                    size="md"
                    style={{
                      position: "absolute",
                      top: 10,
                      right: 10,
                      boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                    }}
                    onClick={() => toggleWishlist(prod.id)}
                  >
                    <IconHeart size={16} fill={isLiked ? "currentColor" : "none"} />
                  </ActionIcon>
                </Box>

                {/* Product Info */}
                <Box mt="sm">
                  <Badge size="xs" variant="light" color="primaryPink">
                    {prod.category}
                  </Badge>

                  <Text
                    fw={700}
                    size="sm"
                    c={myOxygenColors.darkText}
                    mt={6}
                    lineClamp={1}
                  >
                    {prod.title}
                  </Text>

                  <Group gap={6} align="center" mt={4}>
                    <Rating value={prod.rating} fractions={2} readOnly size="xs" color="yellow" />
                    <Text size="xs" c="dimmed">
                      ({prod.reviewsCount})
                    </Text>
                  </Group>

                  <Group justify="space-between" align="center" mt="sm">
                    <Text fw={800} size="lg" c={myOxygenColors.darkText}>
                      ৳ {prod.price}
                    </Text>
                  </Group>

                  <Button
                    fullWidth
                    radius="xl"
                    color="primaryPink"
                    size="sm"
                    mt="md"
                    leftSection={<IconShoppingCart size={16} />}
                    fw={700}
                    style={{
                      boxShadow: "0 4px 12px rgba(255, 107, 139, 0.3)",
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
