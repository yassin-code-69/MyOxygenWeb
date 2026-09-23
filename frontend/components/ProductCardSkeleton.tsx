"use client";

import React from "react";
import { Card, Skeleton, Box } from "@mantine/core";

export interface ProductCardSkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Zero-CLS skeleton placeholder mirroring ProductCard dimensions exactly.
 */
export function ProductCardSkeleton({ className, style }: ProductCardSkeletonProps) {
  return (
    <Card
      padding="md"
      radius="lg"
      className={className}
      style={{
        border: "1px solid #F3F4F6",
        backgroundColor: "#FFFFFF",
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.02)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        ...style,
      }}
    >
      <Box>
        {/* Product Image placeholder */}
        <Skeleton height={220} radius="md" />

        {/* Category & Expiry placeholder */}
        <Skeleton height={14} width="35%" mt="sm" radius="sm" />

        {/* Product Title placeholder */}
        <Skeleton height={16} width="80%" mt="xs" radius="sm" />

        {/* Price placeholder */}
        <Skeleton height={18} width="40%" mt="xs" radius="sm" />
      </Box>

      {/* Add to Cart button placeholder */}
      <Skeleton height={36} radius="xl" mt="md" />
    </Card>
  );
}
