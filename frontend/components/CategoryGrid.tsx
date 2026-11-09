"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { Anchor, Container, Group, Skeleton, Text } from "@mantine/core";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { AnimatedSection } from "./AnimatedSection";
import { BrandButton } from "./BrandButton";
import { EmptyState } from "./EmptyState";
import { ImageWithFallback } from "./ImageWithFallback";
import { SectionHeader } from "./SectionHeader";
import { formatProductCount, getCategoryVisual, rankShowcaseCategories } from "./storefront/category-visuals";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "./storefront/CategoryGrid.module.css";

const MAX_HOME_CATEGORIES = 8;

function CategoryCardSkeleton() {
  return (
    <li aria-hidden>
      <div className={classes.card} style={{ "--card-bg": "var(--mo-color-surface)", "--card-border": "var(--mo-color-border-brand)" } as CSSProperties}>
        <div className={classes.media}>
          <Skeleton height="100%" radius="md" />
        </div>
        <div className={classes.body}>
          <Skeleton height={18} width="70%" radius="xl" />
          <Skeleton height={12} width="45%" radius="xl" />
          <Skeleton height={28} width={90} radius="xl" mt={8} />
        </div>
      </div>
    </li>
  );
}

/** "Shop by category" grid from `GET /catalog/categories` (2 columns on phones, hover lift). */
export function CategoryGrid() {
  const { categories, isLoaded, error, mutate } = useCategories();
  const showcase = rankShowcaseCategories(categories).slice(0, MAX_HOME_CATEGORIES);

  if (isLoaded && showcase.length === 0) {
    return null;
  }

  return (
    <AnimatedSection className={classes.section} aria-labelledby="home-categories-title">
      <Container size="xl">
        <SectionHeader
          eyebrow="Categories"
          title={<span id="home-categories-title">Shop by Category</span>}
          action={
            <Anchor component={Link} href="/products" fw={700} size="sm">
              <Group gap={4} component="span">
                View all products
                <IconArrowRight size={16} stroke={2.2} aria-hidden />
              </Group>
            </Anchor>
          }
        />

        {error && !isLoaded ? (
          <EmptyState
            title="Categories could not be loaded"
            description="Please check your connection and try again."
            action={
              <BrandButton variant="outline" leftSection={<IconRefresh size={16} aria-hidden />} onClick={() => mutate()}>
                Retry
              </BrandButton>
            }
          />
        ) : (
          <ul className={classes.grid}>
            {!isLoaded
              ? Array.from({ length: 4 }, (_, index) => <CategoryCardSkeleton key={index} />)
              : showcase.map((category, index) => {
                  const visual = getCategoryVisual(category, index);
                  const photo = visual.image;
                  const cardStyle = {
                    "--card-bg": `var(--mantine-color-${visual.accent}-0)`,
                    "--card-border": `var(--mantine-color-${visual.accent}-1)`,
                    "--explore-bg": `var(--mantine-color-${visual.accent}-8)`,
                  } as CSSProperties;
                  return (
                    <li key={category.id}>
                      <Link href={`/categories/${category.slug}`} className={classes.card} style={cardStyle}>
                        <div className={classes.media}>
                          <ImageWithFallback
                            src={photo ?? visual.icon}
                            alt=""
                            fill
                            sizes="(max-width: 62em) 50vw, 300px"
                            className={photo ? classes.image : `${classes.image} ${classes.iconOnly}`}
                          />
                        </div>
                        <div className={classes.body}>
                          <h3 className={classes.name}>{category.name}</h3>
                          <Text size="xs" fw={600} c="var(--mo-color-text-secondary)" className="mo-tabular-nums">
                            {formatProductCount(category.productCount)}
                          </Text>
                          {visual.description ? <span className={classes.tagline}>{visual.description}</span> : null}
                          <span className={classes.explore} aria-hidden>
                            Explore
                            <IconArrowRight size={14} stroke={2.4} className={classes.exploreArrow} />
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
          </ul>
        )}
      </Container>
    </AnimatedSection>
  );
}
