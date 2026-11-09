"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import Link from "next/link";
import { Anchor, Container, Group, UnstyledButton } from "@mantine/core";
import { AnimatePresence, motion } from "motion/react";
import { IconArrowRight, IconRefresh } from "@tabler/icons-react";
import { AnimatedSection } from "./AnimatedSection";
import { BrandButton } from "./BrandButton";
import { EmptyState } from "./EmptyState";
import { PRODUCT_CARD_IMAGE_SIZES, ProductCard } from "./ProductCard";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { SectionHeader } from "./SectionHeader";
import { toProductCardData } from "./catalog/product-mappers";
import { rankShowcaseCategories } from "./storefront/category-visuals";
import { fadeInUp, staggerContainer, transitions } from "../lib/animations";
import { useProducts } from "../hooks/use-products";
import { useAddToCart } from "../hooks/catalog/use-add-to-cart";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "./storefront/FeaturedProducts.module.css";

const ALL_TAB = "all";
const MAX_CATEGORY_TABS = 4;
const FEATURED_COUNT = 4;

interface FeaturedTab {
  value: string;
  label: string;
}

/**
 * "Featured products" rail: best sellers (`sort=popular`) from the API, filterable by
 * real categories. Tabs follow the WAI-ARIA tabs pattern (arrow keys move focus); the
 * active pill slides with a `layoutId` transition and the grid cross-fades with
 * `AnimatePresence`, showing skeletons while a tab's products load.
 */
export function FeaturedProducts() {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<string>(ALL_TAB);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const addToCart = useAddToCart();
  const { categories } = useCategories();

  const tabs: FeaturedTab[] = [
    { value: ALL_TAB, label: "All" },
    ...rankShowcaseCategories(categories)
      .slice(0, MAX_CATEGORY_TABS)
      .map((category) => ({ value: category.slug, label: category.name })),
  ];

  const { products, isLoading, error, mutate } = useProducts({
    category: activeTab === ALL_TAB ? null : activeTab,
    sort: "popular",
    limit: FEATURED_COUNT,
  });

  const panelId = `${baseId}-panel`;
  const tabId = (value: string) => `${baseId}-tab-${value}`;

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((tab) => tab.value === activeTab);
    let next = index;
    if (event.key === "ArrowRight") {
      next = (index + 1) % tabs.length;
    } else if (event.key === "ArrowLeft") {
      next = (index - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      next = 0;
    } else if (event.key === "End") {
      next = tabs.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    setActiveTab(tabs[next].value);
    tabRefs.current[next]?.focus();
  };

  let panel: ReactNode;
  if (isLoading) {
    panel = (
      <div className={classes.grid} aria-busy="true">
        <ProductCardSkeleton count={FEATURED_COUNT} />
      </div>
    );
  } else if (error) {
    panel = (
      <EmptyState
        title="Products could not be loaded"
        description="Please check your connection and try again."
        action={
          <BrandButton variant="outline" leftSection={<IconRefresh size={16} aria-hidden />} onClick={() => mutate()}>
            Retry
          </BrandButton>
        }
      />
    );
  } else if (products.length === 0) {
    panel = (
      <EmptyState
        title="Nothing here yet"
        description="New products for this category are on their way."
        action={
          <BrandButton component={Link} href="/products" variant="outline">
            Browse all products
          </BrandButton>
        }
      />
    );
  } else {
    panel = (
      <motion.ul className={classes.grid} variants={staggerContainer} initial="initial" animate="animate">
        {products.map((product) => (
          <motion.li key={product.id} variants={fadeInUp} layout="position">
            <ProductCard
              product={toProductCardData(product)}
              sizes={PRODUCT_CARD_IMAGE_SIZES}
              onAddToCart={() => {
                addToCart(product);
              }}
            />
          </motion.li>
        ))}
      </motion.ul>
    );
  }

  return (
    <AnimatedSection className={classes.section} aria-labelledby={`${baseId}-title`}>
      <Container size="xl">
        <SectionHeader
          eyebrow="Best sellers"
          title={<span id={`${baseId}-title`}>Featured Products</span>}
          action={
            <Anchor component={Link} href="/products?sort=popular" fw={700} size="sm">
              <Group gap={4} component="span">
                View all
                <IconArrowRight size={16} stroke={2.2} aria-hidden />
              </Group>
            </Anchor>
          }
        />

        <div role="tablist" aria-label="Filter featured products by category" className={classes.tabs}>
          {tabs.map((tab, index) => {
            const selected = tab.value === activeTab;
            return (
              <UnstyledButton
                key={tab.value}
                ref={(node: HTMLButtonElement | null) => {
                  tabRefs.current[index] = node;
                }}
                id={tabId(tab.value)}
                role="tab"
                aria-selected={selected}
                aria-controls={panelId}
                tabIndex={selected ? 0 : -1}
                className={classes.tab}
                data-active={selected || undefined}
                onClick={() => setActiveTab(tab.value)}
                onKeyDown={handleKeyDown}
              >
                {selected ? (
                  <motion.span layoutId={`${baseId}-indicator`} className={classes.indicator} transition={transitions.snappySpring} />
                ) : null}
                <span className={classes.tabLabel}>{tab.label}</span>
              </UnstyledButton>
            );
          })}
        </div>

        <div id={panelId} role="tabpanel" aria-labelledby={tabId(activeTab)}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: transitions.easeOut }}
              exit={{ opacity: 0, y: -8, transition: transitions.quick }}
            >
              {panel}
            </motion.div>
          </AnimatePresence>
        </div>
      </Container>
    </AnimatedSection>
  );
}
