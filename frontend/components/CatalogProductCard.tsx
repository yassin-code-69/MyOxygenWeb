"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Card,
  Image,
  Text,
  Group,
  Badge,
  ActionIcon,
  Box,
  Button,
  Rating,
} from "@mantine/core";
import { IconShoppingCart, IconHeart, IconHeartFilled } from "@tabler/icons-react";
import { notifications } from "@mantine/notifications";
import { useCartStore } from "../lib/cart-store";
import type { CatalogItem } from "../lib/catalog-data";

interface CatalogProductCardProps {
  product: CatalogItem;
}

export function CatalogProductCard({ product }: CatalogProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(false);
  const addItem = useCartStore((state) => state.addItem);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    addItem({
      id: product.id,
      title: product.title,
      slug: product.slug,
      image: product.image,
      unitPrice: product.effectivePrice,
      originalPrice: product.basePrice,
      maxStock: 50,
      quantity: 1,
    });

    notifications.show({
      title: "Added to Cart! 🛒",
      message: `${product.title} has been added to your shopping bag.`,
      color: "pink",
      autoClose: 2500,
    });
  };

  const handleToggleWishlist = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsWishlisted((prev) => !prev);

    notifications.show({
      title: !isWishlisted ? "Saved to Wishlist ♡" : "Removed from Wishlist",
      message: product.title,
      color: "pink",
      autoClose: 2000,
    });
  };

  // Category badge color mapping
  const categoryBadgeColors: Record<string, { bg: string; color: string }> = {
    newborn: { bg: "#FFF0F3", color: "#FF6B8B" },
    "mother-care": { bg: "#EDFBF3", color: "#2E7D32" },
    "skin-care": { bg: "#F0FDF4", color: "#0F766E" },
    "inner-wear": { bg: "#FFF1F2", color: "#BE123C" },
  };

  const badgeStyle = categoryBadgeColors[product.categorySlug] || {
    bg: "#FFF0F3",
    color: "#FF6B8B",
  };

  return (
    <Card
      p="sm"
      radius="lg"
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid #FFE4EC",
        borderRadius: "16px",
        boxShadow: "0 4px 16px rgba(255, 107, 139, 0.05)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        cursor: "pointer",
        position: "relative",
      }}
      styles={{
        root: {
          "&:hover": {
            transform: "translateY(-4px)",
            boxShadow: "0 10px 28px rgba(255, 107, 139, 0.14)",
            borderColor: "#FF8FA4",
          },
        },
      }}
    >
      <Box>
        {/* Top Floating Controls: Discount Pill (Left) & Wishlist (Right) */}
        <Group justify="space-between" align="center" mb={6}>
          {product.discountPercentage > 0 ? (
            <Badge
              variant="filled"
              radius="xl"
              size="xs"
              style={{
                backgroundColor: "#FF4D6D",
                color: "#FFFFFF",
                fontWeight: 700,
                fontSize: "11px",
                padding: "3px 8px",
                boxShadow: "0 2px 6px rgba(255, 77, 109, 0.35)",
              }}
            >
              -{product.discountPercentage}%
            </Badge>
          ) : (
            <Box />
          )}

          <ActionIcon
            variant="subtle"
            radius="xl"
            size="sm"
            onClick={handleToggleWishlist}
            aria-label="Wishlist"
            style={{
              color: isWishlisted ? "#FF4D6D" : "#9CA3AF",
              transition: "transform 0.15s ease",
            }}
          >
            {isWishlisted ? (
              <IconHeartFilled size={18} color="#FF4D6D" />
            ) : (
              <IconHeart size={18} stroke={1.8} />
            )}
          </ActionIcon>
        </Group>

        {/* Product Image (1:1 Ratio with clean white/soft background) */}
        <Box
          style={{
            position: "relative",
            width: "100%",
            aspectRatio: "1 / 1",
            borderRadius: "12px",
            overflow: "hidden",
            backgroundColor: "#FCFDFE",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
          }}
        >
          <Image
            src={product.image}
            alt={product.title}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
              transition: "transform 0.25s ease",
            }}
          />
        </Box>

        {/* Product Meta Section */}
        <Box mt={10}>
          {/* Title */}
          <Text
            fw={700}
            size="sm"
            c="#1F2937"
            lineClamp={1}
            title={product.title}
            style={{ fontSize: "0.92rem", lineHeight: 1.3 }}
          >
            {product.title}
          </Text>

          {/* Category Pill Tag */}
          <Box mt={5}>
            <Badge
              size="xs"
              radius="sm"
              variant="light"
              style={{
                backgroundColor: badgeStyle.bg,
                color: badgeStyle.color,
                fontWeight: 600,
                textTransform: "capitalize",
                padding: "2px 6px",
                fontSize: "10px",
              }}
            >
              {product.category}
            </Badge>
          </Box>

          {/* Rating */}
          <Group gap={4} align="center" mt={6}>
            <Rating
              value={product.rating}
              fractions={2}
              readOnly
              size="xs"
              color="#F59E0B"
            />
            <Text size="xs" c="#6B7280" fw={500}>
              ({product.rating.toFixed(1)})
            </Text>
          </Group>

          {/* Price Row */}
          <Group align="baseline" gap={8} mt={8}>
            <Text fw={800} size="md" c="#FF4D6D" style={{ fontSize: "1.1rem" }}>
              ৳ {product.effectivePrice.toLocaleString()}
            </Text>
            {product.basePrice > product.effectivePrice && (
              <Text
                size="xs"
                td="line-through"
                c="#9CA3AF"
                fw={500}
              >
                ৳ {product.basePrice.toLocaleString()}
              </Text>
            )}
          </Group>
        </Box>
      </Box>

      {/* Add to Cart CTA Button */}
      <Box mt={12}>
        <Button
          fullWidth
          size="sm"
          radius="xl"
          onClick={handleAddToCart}
          leftSection={<IconShoppingCart size={15} stroke={2.2} />}
          style={{
            backgroundColor: "#FF4D6D",
            color: "#FFFFFF",
            fontWeight: 700,
            fontSize: "0.85rem",
            height: 38,
            boxShadow: "0 4px 14px rgba(255, 77, 109, 0.3)",
            transition: "all 0.15s ease",
          }}
          styles={{
            root: {
              "&:hover": {
                backgroundColor: "#E63956",
                transform: "translateY(-1px)",
                boxShadow: "0 6px 18px rgba(255, 77, 109, 0.45)",
              },
            },
          }}
        >
          Add to Cart
        </Button>
      </Box>
    </Card>
  );
}
