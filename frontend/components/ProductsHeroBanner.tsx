"use client";

import type { ReactNode } from "react";
import { Box, Grid, Group, Text, ThemeIcon, type MantineColor } from "@mantine/core";
import {
  IconCalendarCheck,
  IconCash,
  IconHeartFilled,
  IconShieldCheck,
  IconTruckDelivery,
  type Icon,
} from "@tabler/icons-react";
import { ImageWithFallback } from "./ImageWithFallback";
import { formatBDT } from "../lib/format";
import classes from "./storefront/ProductsHeroBanner.module.css";

interface Highlight {
  title: string;
  subtitle: string;
  icon: Icon;
  color: MantineColor;
}

/** Store promises that are backed by the platform (API contract: delivery rule, COD, FEFO batches). */
const HIGHLIGHTS: readonly Highlight[] = [
  { title: "100% Original", subtitle: "Genuine products", icon: IconShieldCheck, color: "primaryPink" },
  { title: "Free delivery", subtitle: `On orders from ${formatBDT(1500)}`, icon: IconTruckDelivery, color: "secondaryGreen" },
  { title: "Cash on delivery", subtitle: "Pay at your door", icon: IconCash, color: "primaryPink" },
  { title: "Batch tracked", subtitle: "Expiry shown on care items", icon: IconCalendarCheck, color: "accentPurple" },
];

export interface ProductsHeroBannerProps {
  /** Page heading (rendered as the page's `h1`). */
  title: ReactNode;
  /** Hand-written eyebrow above the title. */
  eyebrow?: string;
  description?: ReactNode;
  /** Photo in the circular frame. Defaults to the brand mother & baby photo. */
  imageSrc?: string | null;
  imageAlt?: string;
}

/**
 * Hero banner for the shop and category pages (owner's design: blush wash, script
 * eyebrow, circular photo with mint crescent). Decorations are CSS shapes.
 */
export function ProductsHeroBanner({
  title,
  eyebrow = "Shop with Confidence ♡",
  description = "Discover the best products for you and your family.",
  imageSrc,
  imageAlt = "Mother smiling at her newborn baby",
}: ProductsHeroBannerProps) {
  return (
    <Box className={classes.banner}>
      <IconHeartFilled size={40} className={`${classes.heart} ${classes.heartOne}`} aria-hidden />
      <IconHeartFilled size={50} className={`${classes.heart} ${classes.heartTwo}`} aria-hidden />
      <span className={classes.cornerLeaf} aria-hidden />

      <Grid align="center" gap={{ base: "lg", md: "xl" }} className={classes.content}>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Text className={classes.eyebrow}>{eyebrow}</Text>
          <h1 className={classes.title}>{title}</h1>
          {description ? <Text className={classes.description}>{description}</Text> : null}

          <Grid gap={{ base: "xs", sm: "sm" }}>
            {HIGHLIGHTS.map((item) => {
              const HighlightIcon = item.icon;
              return (
                <Grid.Col key={item.title} span={{ base: 6, sm: 3 }}>
                  <Group gap={8} wrap="nowrap">
                    <ThemeIcon size={38} radius="xl" variant="light" color={item.color}>
                      <HighlightIcon size={20} aria-hidden />
                    </ThemeIcon>
                    <div>
                      <Text size="xs" fw={700} c="var(--mo-color-text)" lh={1.2}>
                        {item.title}
                      </Text>
                      <Text size="xs" c="var(--mo-color-text-secondary)" lh={1.2}>
                        {item.subtitle}
                      </Text>
                    </div>
                  </Group>
                </Grid.Col>
              );
            })}
          </Grid>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }} visibleFrom="sm">
          <div className={classes.visual}>
            <span className={classes.crescent} aria-hidden />
            <div className={classes.frame}>
              <ImageWithFallback
                src={imageSrc ?? "/images/hero-mother-baby.jpg"}
                alt={imageAlt}
                fill
                sizes="240px"
                className={classes.frameImage}
              />
            </div>
            <span className={classes.script} aria-hidden>
              Happy
              <br />
              Healthy
              <br />
              Mom &amp;
              <br />
              Baby ♡
            </span>
          </div>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
