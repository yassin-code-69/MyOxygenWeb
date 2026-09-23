"use client";

import { Box } from "@mantine/core";
import { Navbar } from "../components/Navbar";
import { FeaturesBar } from "../components/FeaturesBar";
import { HeroBanner } from "../components/HeroBanner";
import { CategoryGrid } from "../components/CategoryGrid";
import { SpecialCareBanner } from "../components/SpecialCareBanner";
import { FeaturedProducts } from "../components/FeaturedProducts";
import { Footer } from "../components/Footer";
import { AnimatedSection } from "../components/AnimatedSection";

export default function HomePage() {
  return (
    <Box style={{ minHeight: "100vh", paddingBottom: 70 }}>
      <Navbar />

      <AnimatedSection direction="down" delay={0.05}>
        <FeaturesBar />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.1}>
        <HeroBanner />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.15}>
        <CategoryGrid />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.15}>
        <SpecialCareBanner />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.2}>
        <FeaturedProducts />
      </AnimatedSection>

      <Footer />
    </Box>
  );
}
