"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Box, Group, Text } from "@mantine/core";
import { ImageWithFallback } from "../../ImageWithFallback";
import classes from "./kit.module.css";

export interface ThumbProps {
  src: string | null | undefined;
  /** Describe the image, or `""` when the adjacent text already names it. */
  alt?: string;
  /** Square size in px. Default 40. */
  size?: number;
}

/** Rounded product thumbnail with the brand placeholder fallback. */
export function Thumb({ src, alt = "", size = 40 }: ThumbProps) {
  return (
    <Box className={classes.thumb} w={size} h={size}>
      <ImageWithFallback src={src} alt={alt} width={size} height={size} sizes={`${size}px`} />
    </Box>
  );
}

export interface ThumbCellProps {
  image: string | null | undefined;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Makes the title a link (keyboard reachable). */
  href?: string;
  /** Thumbnail size in px. Default 40. */
  size?: number;
  /** Image alt; defaults to empty because the title names the product. */
  alt?: string;
}

/**
 * Product thumbnail + title (+ subtitle) for tables and lists.
 *
 * ```tsx
 * <ThumbCell image={p.image} title={p.title} subtitle={p.categoryName} href={`/admin/products?productId=${p.productId}`} />
 * ```
 */
export function ThumbCell({ image, title, subtitle, href, size = 40, alt = "" }: ThumbCellProps) {
  return (
    <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
      <Thumb src={image} alt={alt} size={size} />
      <Box style={{ minWidth: 0 }}>
        {href ? (
          <Text component={Link} href={href} size="sm" fw={600} lineClamp={1} className={classes.cellLink}>
            {title}
          </Text>
        ) : (
          <Text size="sm" fw={600} lineClamp={1} c="var(--mo-color-text)">
            {title}
          </Text>
        )}
        {subtitle ? (
          <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
            {subtitle}
          </Text>
        ) : null}
      </Box>
    </Group>
  );
}
