"use client";

import React, { useState } from "react";
import {
  Card,
  Image,
  Text,
  Group,
  Badge,
  ActionIcon,
  Box,
  Rating,
} from "@mantine/core";
import { IconShoppingCart, IconHeart, IconCalendarTime } from "@tabler/icons-react";
import { motion } from "motion/react";
import { BrandButton } from "./BrandButton";
import { cardHoverProps } from "../lib/animations";
import { myOxygenColors } from "../tokens";

export interface ProductCardProps {
  id: string;
  title: string;
  slug?: string;
  image: string;
  category?: string;
  basePrice: number | string;
  effectivePrice?: number | string;
  discountPercentage?: number;
  requiresBatchTracking?: boolean;
  batchExpiry?: string | Date;
  rating?: number;
  reviewsCount?: number;
  inStock?: boolean;
  onAddToCart?: (productId: string) => void;
  onToggleWishlist?: (productId: string) => void;
  onCardClick?: (productId: string) => void;
  isWishlisted?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ProductCard({
  id,
  title,
  slug: _slug,
  image,
  category,
  basePrice,
  effectivePrice,
  discountPercentage,
  requiresBatchTracking = false,
  batchExpiry,
  rating,
  reviewsCount,
  inStock = true,
  onAddToCart,
  onToggleWishlist,
  onCardClick,
  isWishlisted: initialWishlisted = false,
  className,
  style,
}: ProductCardProps) {
  const [isWishlisted, setIsWishlisted] = useState(initialWishlisted);

  const numBasePrice = typeof basePrice === "number" ? basePrice : parseFloat(basePrice) || 0;
  const numEffectivePrice =
    effectivePrice !== undefined
      ? typeof effectivePrice === "number"
        ? effectivePrice
        : parseFloat(effectivePrice) || numBasePrice
      : numBasePrice;

  // Compute discount percentage if not explicitly passed
  const calculatedDiscount =
    discountPercentage !== undefined
      ? discountPercentage
      : numBasePrice > numEffectivePrice && numBasePrice > 0
      ? Math.round(((numBasePrice - numEffectivePrice) / numBasePrice) * 100)
      : 0;

  const hasDiscount = calculatedDiscount > 0;

  // Format batch expiry if tracked
  const formattedExpiry = (() => {
    if (!requiresBatchTracking) {
      return null;
    }
    if (!batchExpiry) {
      return "Exp: Mar 2027";
    }
    if (typeof batchExpiry === "string") {
      return batchExpiry.startsWith("Exp:") ? batchExpiry : `Exp: ${batchExpiry}`;
    }
    const d = new Date(batchExpiry);
    if (isNaN(d.getTime())) {
      return "Exp: Mar 2027";
    }
    return `Exp: ${d.toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
  })();

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsWishlisted((prev) => !prev);
    onToggleWishlist?.(id);
  };

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inStock && onAddToCart) {
      onAddToCart(id);
    }
  };

  return (
    <motion.div
      {...cardHoverProps}
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
      }}
    >
      <Card
        padding="md"
        radius="lg"
        className={className}
        onClick={() => onCardClick?.(id)}
        style={{
          border: "1px solid #F3F4F6",
          backgroundColor: "#FFFFFF",
          boxShadow: "0 4px 15px rgba(0, 0, 0, 0.03)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height: "100%",
          cursor: onCardClick ? "pointer" : "default",
          ...style,
        }}
      >
        <Box>
          {/* Product Image Container with 1:1 Aspect Ratio & Zoom Hover */}
          <Box
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: "1 / 1",
              borderRadius: "12px",
              overflow: "hidden",
              backgroundColor: "#F9FAFB",
            }}
          >
            <motion.div
              whileHover={{ scale: 1.05 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{
                width: "100%",
                height: "100%",
              }}
            >
              <Image
                src={image}
                alt={title}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </motion.div>

            {/* Discount Pill */}
            {hasDiscount && (
              <Badge
                variant="filled"
                radius="sm"
                size="sm"
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  backgroundColor: myOxygenColors.primaryPink,
                  color: "#FFFFFF",
                  fontWeight: 700,
                  letterSpacing: "0.5px",
                  boxShadow: "0 2px 6px rgba(255, 107, 139, 0.4)",
                  zIndex: 2,
                }}
              >
                {calculatedDiscount}% OFF
              </Badge>
            )}

            {/* Wishlist Button */}
            <ActionIcon
              variant="filled"
              color={isWishlisted ? "red" : "white"}
              c={isWishlisted ? "white" : "gray"}
              radius="xl"
              size="md"
              aria-label={isWishlisted ? "Remove from wishlist" : "Add to wishlist"}
              style={{
                position: "absolute",
                top: 10,
                right: 10,
                boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                zIndex: 2,
              }}
              onClick={handleWishlistClick}
            >
              <IconHeart size={16} fill={isWishlisted ? "currentColor" : "none"} />
            </ActionIcon>
          </Box>

          {/* Product Meta Section */}
          <Box mt="sm">
            <Group justify="space-between" align="center" gap="xs">
              {category && (
                <Badge size="xs" variant="light" color="primaryPink">
                  {category}
                </Badge>
              )}

              {/* Perishable Batch Info Tag */}
              {requiresBatchTracking && formattedExpiry && (
                <Badge
                  size="xs"
                  variant="light"
                  color="teal"
                  leftSection={<IconCalendarTime size={12} />}
                  style={{ textTransform: "none", fontWeight: 600 }}
                >
                  {formattedExpiry}
                </Badge>
              )}
            </Group>

            {/* Product Title */}
            <Text
              fw={700}
              size="sm"
              c={myOxygenColors.darkText}
              mt={8}
              lineClamp={2}
              style={{ minHeight: "2.6em" }}
            >
              {title}
            </Text>

            {/* Rating Section */}
            {rating !== undefined && (
              <Group gap={6} align="center" mt={4}>
                <Rating value={rating} fractions={2} readOnly size="xs" color="yellow" />
                {reviewsCount !== undefined && (
                  <Text size="xs" c="dimmed">
                    ({reviewsCount})
                  </Text>
                )}
              </Group>
            )}

            {/* Pricing Section */}
            <Group align="baseline" gap="xs" mt="sm">
              <Text fw={800} size="lg" c={myOxygenColors.darkText}>
                ৳ {numEffectivePrice.toLocaleString()}
              </Text>
              {hasDiscount && (
                <Text size="sm" td="line-through" c={myOxygenColors.textGray} fw={500}>
                  ৳ {numBasePrice.toLocaleString()}
                </Text>
              )}
            </Group>
          </Box>
        </Box>

        {/* Add to Cart CTA */}
        <Box mt="md">
          <BrandButton
            variant="primary"
            fullWidth
            size="sm"
            radius="xl"
            disabled={!inStock}
            onClick={handleAddToCart}
            leftSection={<IconShoppingCart size={16} />}
          >
            {inStock ? "Add to Cart" : "Out of Stock"}
          </BrandButton>
        </Box>
      </Card>
    </motion.div>
  );
}
