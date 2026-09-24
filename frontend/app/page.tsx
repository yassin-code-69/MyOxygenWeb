"use client";

import { Box } from "@mantine/core";
import { Navbar } from "../components/Navbar";
import { HeroBanner } from "../components/HeroBanner";
import { FeaturesBar } from "../components/FeaturesBar";
import { CategoryGrid } from "../components/CategoryGrid";
import { SpecialCareBanner } from "../components/SpecialCareBanner";
import { FeaturedProducts } from "../components/FeaturedProducts";
import { Footer } from "../components/Footer";
import { AnimatedSection } from "../components/AnimatedSection";

export default function HomePage() {
  return (
    <Box style={{ minHeight: "100vh", backgroundColor: "#FFF8F6" }}>
      <Navbar />

      <AnimatedSection direction="up" delay={0.05}>
        <HeroBanner />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.1}>
        <FeaturesBar />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.15}>
        <CategoryGrid />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.2}>
        <SpecialCareBanner />
      </AnimatedSection>

      <AnimatedSection direction="up" delay={0.25}>
        <FeaturedProducts />
      </AnimatedSection>

      <Footer />
    </Box>
  );
}
