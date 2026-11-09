"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { Box, Group, Text, type MantineSpacing, type StyleProp } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import classes from "./kit.module.css";

export interface SectionCardProps {
  /** Card heading (rendered as an `h2` by default). */
  title?: ReactNode;
  /** Muted line under the title ("Last 7 days"). */
  subtitle?: ReactNode;
  /** Small icon before the title. */
  icon?: ReactNode;
  /** Adds a "View All →" link in the header. */
  viewAllHref?: string;
  viewAllLabel?: string;
  /** Header controls (selects, toggles), placed before the "View All" link. */
  actions?: ReactNode;
  /** When true, `skeleton` replaces the body (the header stays, so nothing shifts). */
  loading?: boolean;
  /** Body placeholder with the same dimensions as the loaded body. */
  skeleton?: ReactNode;
  children?: ReactNode;
  /** Inner padding. Default `lg`. */
  padding?: StyleProp<MantineSpacing>;
  /** Render the body edge-to-edge (tables), keeping the header padded. */
  flush?: boolean;
  /** Heading level of the title. Default 2. */
  titleOrder?: 2 | 3 | 4;
  /** Stretch to the grid cell height. Default true. */
  fullHeight?: boolean;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * White rounded card with a title row (title, subtitle, actions, "View All →")
 * — the building block of every dashboard / report section.
 *
 * ```tsx
 * <SectionCard title="Top Selling Products" viewAllHref="/admin/reports/products"
 *   loading={!data} skeleton={<RankedProductList loading items={undefined} />}>
 *   <RankedProductList items={rows} />
 * </SectionCard>
 * ```
 */
export function SectionCard({
  title,
  subtitle,
  icon,
  viewAllHref,
  viewAllLabel = "View All",
  actions,
  loading = false,
  skeleton,
  children,
  padding = "lg",
  flush = false,
  titleOrder = 2,
  fullHeight = true,
  id,
  className,
  style,
}: SectionCardProps) {
  const hasHeader = Boolean(title || subtitle || actions || viewAllHref);
  const headingTag = `h${titleOrder}` as const;
  const generatedId = useId();
  const headingId = id ? `${id}-title` : `section-${generatedId.replace(/:/g, "")}`;

  return (
    <Box
      component="section"
      id={id}
      className={[classes.card, className].filter(Boolean).join(" ")}
      style={style}
      h={fullHeight ? "100%" : undefined}
      p={flush ? 0 : padding}
      aria-labelledby={title ? headingId : undefined}
      aria-busy={loading || undefined}
    >
      {hasHeader ? (
        <Box className={classes.cardHeader} px={flush ? padding : 0} pt={flush ? padding : 0} mb="md">
          <Box style={{ minWidth: 0, flex: "1 1 120px" }}>
            {title ? (
              <Group gap={8} wrap="nowrap">
                {icon}
                <Text component={headingTag} id={headingId} className={classes.cardTitle} truncate>
                  {title}
                </Text>
              </Group>
            ) : null}
            {subtitle ? (
              <Text size="xs" c="var(--mo-color-text-muted)" mt={2}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
          {actions || viewAllHref ? (
            <Group gap="sm" wrap="nowrap" style={{ flexShrink: 0 }}>
              {actions}
              {viewAllHref ? (
                <Link
                  href={viewAllHref}
                  className={classes.viewAll}
                  aria-label={typeof title === "string" ? `${viewAllLabel}: ${title}` : undefined}
                >
                  {viewAllLabel}
                  <IconArrowRight size={14} stroke={2.2} aria-hidden />
                </Link>
              ) : null}
            </Group>
          ) : null}
        </Box>
      ) : null}
      <div className={classes.cardBody}>{loading && skeleton !== undefined ? skeleton : children}</div>
    </Box>
  );
}
