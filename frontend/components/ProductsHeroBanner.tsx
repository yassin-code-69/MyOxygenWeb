"use client";

import React from "react";
import { Box, Container, Grid, Text, Title, Group, Image } from "@mantine/core";
import {
  IconShieldCheck,
  IconTruckDelivery,
  IconHeartHandshake,
  IconHeadphones,
} from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

interface ProductsHeroBannerProps {
  categoryTitle?: string;
}

export function ProductsHeroBanner({ categoryTitle }: ProductsHeroBannerProps) {
  return (
    <Box
      py={{ base: 28, md: 36 }}
      px={{ base: 16, md: 32 }}
      style={{
        background: "linear-gradient(135deg, #FFF7F9 0%, #FFEBF1 50%, #FFF8F6 100%)",
        borderRadius: "24px",
        border: "1px solid #FFE4EC",
        position: "relative",
        overflow: "hidden",
        boxShadow: "0 10px 30px rgba(255, 107, 139, 0.05)",
        marginBottom: 32,
      }}
    >
      {/* Background Decorative Hearts & Flourishes */}
      <Box
        style={{
          position: "absolute",
          top: "15%",
          left: "40%",
          opacity: 0.18,
          pointerEvents: "none",
          filter: "blur(1px)",
        }}
      >
        <svg width="40" height="40" viewBox="0 0 24 24" fill="#FF8FA4">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </Box>
      <Box
        style={{
          position: "absolute",
          top: "40%",
          left: "58%",
          opacity: 0.15,
          pointerEvents: "none",
          filter: "blur(1.5px)",
        }}
      >
        <svg width="50" height="50" viewBox="0 0 24 24" fill="#FFA8BA">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </Box>

      {/* Decorative Mint Corner Leaf (Top Right / Bottom Right accents) */}
      <Box
        style={{
          position: "absolute",
          bottom: -10,
          right: -10,
          width: 130,
          height: 130,
          pointerEvents: "none",
          zIndex: 0,
          opacity: 0.85,
        }}
      >
        <svg width="100%" height="100%" viewBox="0 0 130 130" fill="none">
          <path
            d="M130 30C130 85 85 130 10 130C55 125 100 95 120 45C126 33 129 28 130 30Z"
            fill="url(#bannerMintGrad)"
          />
          <defs>
            <linearGradient id="bannerMintGrad" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#4CAF7D" />
              <stop offset="100%" stopColor="#86EFAC" />
            </linearGradient>
          </defs>
        </svg>
      </Box>

      <Grid align="center" gap={{ base: "lg", md: "xl" }} style={{ position: "relative", zIndex: 1 }}>
        {/* Left Column: Heading & 4 Feature Badges */}
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Box>
            {/* Script Eyebrow */}
            <Text
              style={{
                fontFamily: "var(--font-caveat), 'Caveat', cursive, sans-serif",
                color: "#FF6B8B",
                fontSize: "1.65rem",
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: "0.01em",
              }}
            >
              Shop with Confidence ♡
            </Text>

            {/* Main Headline */}
            <Title
              order={1}
              style={{
                fontFamily: "var(--font-poppins), sans-serif",
                color: "#134E4A",
                fontSize: "clamp(2rem, 3.2vw, 2.75rem)",
                fontWeight: 800,
                letterSpacing: "-0.02em",
                margin: "4px 0 8px 0",
                lineHeight: 1.15,
              }}
            >
              {categoryTitle || "All Products"}
            </Title>

            <Text
              size="md"
              c="#4B5563"
              style={{
                fontSize: "1rem",
                fontWeight: 500,
                maxWidth: 480,
                marginBottom: 24,
              }}
            >
              Discover best products for you and your family.
            </Text>

            {/* 4 Feature Badges Row (Matching Mockup) */}
            <Grid gap={{ base: "xs", sm: "sm" }}>
              {/* Badge 1 */}
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Group gap={8} wrap="nowrap" align="center">
                  <Box
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      backgroundColor: "#FFF0F3",
                      border: "1px solid #FFE4EC",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconShieldCheck size={20} color="#FF6B8B" />
                  </Box>
                  <Box>
                    <Text size="xs" fw={700} c="#1F2937" style={{ lineHeight: 1.2 }}>
                      100%
                    </Text>
                    <Text size="11px" c="#6B7280" style={{ lineHeight: 1.1 }}>
                      Original Products
                    </Text>
                  </Box>
                </Group>
              </Grid.Col>

              {/* Badge 2 */}
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Group gap={8} wrap="nowrap" align="center">
                  <Box
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      backgroundColor: "#EDFBF3",
                      border: "1px solid #D1FADF",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconTruckDelivery size={20} color="#4CAF7D" />
                  </Box>
                  <Box>
                    <Text size="xs" fw={700} c="#1F2937" style={{ lineHeight: 1.2 }}>
                      Fast & Safe
                    </Text>
                    <Text size="11px" c="#6B7280" style={{ lineHeight: 1.1 }}>
                      Delivery
                    </Text>
                  </Box>
                </Group>
              </Grid.Col>

              {/* Badge 3 */}
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Group gap={8} wrap="nowrap" align="center">
                  <Box
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      backgroundColor: "#FFF0F3",
                      border: "1px solid #FFE4EC",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconHeartHandshake size={20} color="#FF6B8B" />
                  </Box>
                  <Box>
                    <Text size="xs" fw={700} c="#1F2937" style={{ lineHeight: 1.2 }}>
                      Easy Returns
                    </Text>
                    <Text size="11px" c="#6B7280" style={{ lineHeight: 1.1 }}>
                      Hassle free process
                    </Text>
                  </Box>
                </Group>
              </Grid.Col>

              {/* Badge 4 */}
              <Grid.Col span={{ base: 6, sm: 3 }}>
                <Group gap={8} wrap="nowrap" align="center">
                  <Box
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      backgroundColor: "#E6FFFA",
                      border: "1px solid #B2F5EA",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <IconHeadphones size={20} color="#319795" />
                  </Box>
                  <Box>
                    <Text size="xs" fw={700} c="#1F2937" style={{ lineHeight: 1.2 }}>
                      24/7 Support
                    </Text>
                    <Text size="11px" c="#6B7280" style={{ lineHeight: 1.1 }}>
                      We&apos;re here for you
                    </Text>
                  </Box>
                </Group>
              </Grid.Col>
            </Grid>
          </Box>
        </Grid.Col>

        {/* Right Column: Visual Composition with Mother, Baby & Script */}
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Box
            style={{
              position: "relative",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              minHeight: 220,
            }}
          >
            {/* Mint Green Crescent Background on Left of Circle */}
            <Box
              style={{
                position: "absolute",
                left: "clamp(0px, 8%, 40px)",
                top: "5%",
                width: "clamp(180px, 24vw, 240px)",
                height: "clamp(180px, 24vw, 240px)",
                zIndex: 0,
                pointerEvents: "none",
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 240 240" fill="none">
                <path
                  d="M 140 10 C 60 25 10 90 10 150 C 10 200 50 230 120 240 C 75 210 50 170 50 130 C 50 80 90 35 140 10 Z"
                  fill="#A7F3D0"
                  opacity={0.8}
                />
              </svg>
            </Box>

            {/* Mother and Baby Circular Image Frame */}
            <Box
              style={{
                position: "relative",
                width: "clamp(190px, 24vw, 250px)",
                height: "clamp(190px, 24vw, 250px)",
                borderRadius: "50%",
                overflow: "hidden",
                border: "5px solid #FFFFFF",
                boxShadow: "0 12px 32px rgba(255, 107, 139, 0.15)",
                zIndex: 2,
                backgroundColor: "#FFFFFF",
              }}
            >
              <Image
                src="/images/hero-mother-baby.jpg"
                alt="Mother smiling at newborn baby"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center 15%",
                }}
              />
            </Box>

            {/* Playful Floating Script Text on Right of Circle */}
            <Box
              style={{
                position: "absolute",
                top: "10%",
                right: "clamp(0px, 4%, 25px)",
                zIndex: 3,
                pointerEvents: "none",
                textAlign: "right",
              }}
            >
              <Text
                style={{
                  fontFamily: "var(--font-caveat), 'Caveat', cursive, sans-serif",
                  color: "#FF6B8B",
                  fontSize: "clamp(1.4rem, 2vw, 1.9rem)",
                  fontWeight: 700,
                  lineHeight: 1.05,
                  transform: "rotate(-3deg)",
                  textShadow: "0 2px 6px rgba(255, 107, 139, 0.2)",
                  whiteSpace: "pre-line",
                }}
              >
                {"Happy\nHealthy\nMom &\nBaby ♡"}
              </Text>
            </Box>

            {/* Bottom-right leaf flourish */}
            <Box
              style={{
                position: "absolute",
                bottom: 0,
                right: "clamp(10px, 12%, 50px)",
                width: 70,
                height: 90,
                zIndex: 1,
                pointerEvents: "none",
              }}
            >
              <svg width="100%" height="100%" viewBox="0 0 70 90" fill="none">
                <path
                  d="M10 85 C25 85 55 75 65 50 C72 32 70 12 68 2 C64 18 52 40 35 55 C22 66 12 72 10 85 Z"
                  fill="#4CAF7D"
                  opacity={0.8}
                />
              </svg>
            </Box>
          </Box>
        </Grid.Col>
      </Grid>
    </Box>
  );
}
