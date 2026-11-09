"use client";

import Link from "next/link";
import { Container, Grid, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { AnimatedSection } from "./AnimatedSection";
import { BrandButton } from "./BrandButton";
import { ImageWithFallback } from "./ImageWithFallback";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "./storefront/SpecialCareBanner.module.css";

const FEATURED_SLUG = "newborn";

/** Promotional banner for the newborn range (links to the category when it exists, else the shop). */
export function SpecialCareBanner() {
  const { categories } = useCategories();
  const newborn = categories.find((category) => category.slug === FEATURED_SLUG && category.productCount > 0);
  const href = newborn ? `/categories/${newborn.slug}` : "/products";

  return (
    <AnimatedSection className={classes.section} aria-labelledby="special-care-title">
      <Container size="xl">
        <div className={classes.card}>
          <span className={classes.bubble} aria-hidden />
          <Grid align="center" gap="xl" className={classes.content}>
            <Grid.Col span={{ base: 12, md: 7 }}>
              <h2 id="special-care-title" className={classes.title}>
                Special Care for Your Little One
              </h2>
              <Text mt="xs" fw={600} c="var(--mo-color-text-secondary)" lts="0.02em">
                Safe | Gentle | Trusted
              </Text>
              <BrandButton
                component={Link}
                href={href}
                size="md"
                mt="xl"
                rightSection={<IconArrowRight size={16} stroke={2.4} aria-hidden />}
              >
                {newborn ? `Shop ${newborn.name}` : "Shop now"}
              </BrandButton>
            </Grid.Col>
            <Grid.Col span={{ base: 12, md: 5 }}>
              <div className={classes.media}>
                <ImageWithFallback
                  src="/images/banner-baby.jpg"
                  alt="Smiling baby wrapped in a soft blanket"
                  fill
                  sizes="(max-width: 62em) 100vw, 480px"
                  className={classes.image}
                />
              </div>
            </Grid.Col>
          </Grid>
        </div>
      </Container>
    </AnimatedSection>
  );
}
