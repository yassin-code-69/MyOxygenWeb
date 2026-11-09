"use client";

import Link from "next/link";
import { Box, Container, Grid, Stack, Text } from "@mantine/core";
import { IconArrowRight, IconHeartFilled, IconLeaf } from "@tabler/icons-react";
import { AnimatedSection } from "./AnimatedSection";
import { BrandButton } from "./BrandButton";
import { ImageWithFallback } from "./ImageWithFallback";
import classes from "./storefront/HeroBanner.module.css";

/**
 * Home hero. Rendered with `AnimatedSection priority`: fully visible on first paint (no
 * opacity-0 start), and the photo loads eagerly with high priority — it is the LCP element.
 */
export function HeroBanner() {
  return (
    <AnimatedSection priority className={classes.hero} aria-labelledby="home-hero-title">
      <IconHeartFilled size={48} className={`${classes.bokeh} ${classes.bokehOne}`} aria-hidden />
      <IconHeartFilled size={64} className={`${classes.bokeh} ${classes.bokehTwo}`} aria-hidden />

      <Container size="xl" pos="relative">
        <Grid align="center" gap="xl">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="sm">
              <Text className={classes.eyebrow}>Care for Every Stage</Text>
              <h1 id="home-hero-title" className={classes.title}>
                Your Health,
                <span className={classes.titleAccent}>Our Priority</span>
              </h1>
              <Text className={classes.subtitle}>
                From newborn care to motherhood, skincare and inner wear — everything you need, all in one place.
              </Text>
              <Box pt="sm">
                <BrandButton
                  component={Link}
                  href="/products"
                  size="lg"
                  rightSection={<IconArrowRight size={18} stroke={2.4} aria-hidden />}
                >
                  Shop Now
                </BrandButton>
              </Box>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <div className={classes.visual}>
              <span className={classes.crescent} aria-hidden />
              <div className={classes.frame}>
                <ImageWithFallback
                  src="/images/hero-mother-baby.jpg"
                  alt="Mother holding her newborn baby"
                  fill
                  preload
                  sizes="(max-width: 62em) 80vw, 410px"
                  className={classes.frameImage}
                />
              </div>
              <div className={classes.tag} aria-hidden>
                <IconLeaf size={30} stroke={2.2} className={classes.tagLeaf} />
                <span className={classes.script}>
                  Healthy
                  <br />
                  Mom
                  <br />
                  Happy
                  <br />
                  Baby ♡
                </span>
              </div>
              <span className={classes.leaf} aria-hidden />
            </div>
          </Grid.Col>
        </Grid>
      </Container>
    </AnimatedSection>
  );
}
