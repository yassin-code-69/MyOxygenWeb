"use client";

import Link from "next/link";
import {
  Container,
  Grid,
  Stack,
  Title,
  Text,
  Button,
  Box,
  Image,
} from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

export function HeroBanner() {
  return (
    <Box
      py={{ base: 35, md: 55 }}
      style={{
        background: "linear-gradient(105deg, #FFF7F9 0%, #FFEBF1 45%, #FFF8F6 100%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Soft Blurred Bokeh Hearts (Matching 2nd pic background) */}
      <Box
        style={{
          position: "absolute",
          top: "12%",
          left: "22%",
          opacity: 0.22,
          pointerEvents: "none",
          filter: "blur(1.5px)",
        }}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="#FF8FA4">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </Box>
      <Box
        style={{
          position: "absolute",
          bottom: "10%",
          left: "38%",
          opacity: 0.18,
          pointerEvents: "none",
          filter: "blur(2px)",
        }}
      >
        <svg width="64" height="64" viewBox="0 0 24 24" fill="#FFA8BA">
          <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
        </svg>
      </Box>

      <Container size="xl">
        <Grid align="center" gap="xl">
          {/* Left Text Content */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="sm">
              {/* Italic Eyebrow (Matching 2nd pic: Care for Every Stage in muted teal/green) */}
              <Text
                size="md"
                style={{
                  fontStyle: "italic",
                  fontWeight: 600,
                  color: "#3B757F",
                  letterSpacing: "0.02em",
                  fontFamily: "var(--font-inter)",
                  fontSize: "1.05rem",
                }}
              >
                Care for Every Stage
              </Text>

              {/* Headline (Matching 2nd pic: Your Health in dark, Our Priority in vibrant pink) */}
              <Title
                order={1}
                style={{
                  fontSize: "clamp(2.5rem, 5vw, 4rem)",
                  fontWeight: 800,
                  color: myOxygenColors.darkText,
                  lineHeight: 1.12,
                  fontFamily: "var(--font-poppins)",
                  letterSpacing: "-0.025em",
                }}
              >
                Your Health,
                <Text
                  component="span"
                  inherit
                  display="block"
                  style={{
                    color: myOxygenColors.primaryPink,
                    fontSize: "inherit",
                    fontWeight: "inherit",
                  }}
                >
                  Our Priority
                </Text>
              </Title>

              {/* Subtitle */}
              <Text
                size="md"
                maw={430}
                style={{
                  lineHeight: 1.6,
                  color: "#4B5563",
                  fontSize: "1.02rem",
                }}
              >
                From newborn care to motherhood, skincare and inner wear — everything you need, all in one place.
              </Text>

              {/* CTA Button (Matching 2nd pic: Hot pink pill button) */}
              <Box pt="sm">
                <Button
                  component={Link}
                  href="/products"
                  size="md"
                  radius="xl"
                  rightSection={<IconArrowRight size={17} stroke={2.5} />}
                  style={{
                    backgroundColor: myOxygenColors.primaryPink,
                    boxShadow: "0 8px 24px rgba(255, 107, 139, 0.4)",
                    fontWeight: 700,
                    padding: "0 32px",
                    height: 48,
                    fontSize: "1rem",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  styles={{
                    root: {
                      "&:hover": {
                        backgroundColor: "#F472B6",
                        transform: "translateY(-2px)",
                        boxShadow: "0 12px 28px rgba(255, 107, 139, 0.5)",
                      },
                    },
                  }}
                >
                  Shop Now
                </Button>
              </Box>
            </Stack>
          </Grid.Col>

          {/* Right Visual Image & Composition (Matching 2nd pic Exactly) */}
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Box
              style={{
                position: "relative",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: 440,
              }}
            >
              {/* Organic Mint Green Crescent Swoosh on the LEFT of the Circle (Matching 2nd pic) */}
              <Box
                style={{
                  position: "absolute",
                  left: "clamp(-20px, 2%, 20px)",
                  top: "10%",
                  width: "clamp(260px, 35vw, 380px)",
                  height: "clamp(260px, 35vw, 380px)",
                  zIndex: 0,
                  pointerEvents: "none",
                }}
              >
                <svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 380 380"
                  fill="none"
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <linearGradient id="mintCrescentGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#A7F3D0" stopOpacity="0.85" />
                      <stop offset="50%" stopColor="#6EE7B7" stopOpacity="0.7" />
                      <stop offset="100%" stopColor="#4CAF7D" stopOpacity="0.45" />
                    </linearGradient>
                  </defs>
                  {/* Organic Crescent sweeping on the left */}
                  <path
                    d="M 220 20 C 90 40 10 140 10 240 C 10 320 80 370 190 380 C 120 330 80 270 80 210 C 80 130 140 55 220 20 Z"
                    fill="url(#mintCrescentGrad)"
                  />
                </svg>
              </Box>

              {/* Main Circular Image Frame (Matching 2nd pic) */}
              <Box
                style={{
                  position: "relative",
                  width: "clamp(290px, 38vw, 420px)",
                  height: "clamp(290px, 38vw, 420px)",
                  borderRadius: "50%",
                  overflow: "hidden",
                  border: "6px solid #FFFFFF",
                  boxShadow: "0 18px 45px rgba(255, 107, 139, 0.15)",
                  zIndex: 2,
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Image
                  src="/images/hero-mother-baby.jpg"
                  alt="Loving mother holding newborn baby"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center 15%",
                  }}
                />
              </Box>

              {/* Playful Floating Tag on the RIGHT of Circle (Matching 2nd pic) */}
              <Box
                style={{
                  position: "absolute",
                  top: "14%",
                  right: "clamp(-10px, 0%, 20px)",
                  zIndex: 3,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  pointerEvents: "none",
                }}
              >
                {/* Green Leaf Twig Icon on Top */}
                <Box mb={2} ml={6}>
                  <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
                    {/* Stem */}
                    <path
                      d="M8 26C12 20 18 14 26 8"
                      stroke="#4CAF7D"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    {/* Top Leaf */}
                    <path
                      d="M26 8C26 8 24 2 18 4C13 6 18 12 26 8Z"
                      fill="#4CAF7D"
                    />
                    {/* Mid Leaf */}
                    <path
                      d="M17 15C17 15 11 12 9 16C7 20 13 19 17 15Z"
                      fill="#4CAF7D"
                    />
                  </svg>
                </Box>

                {/* Hand-lettered Brush Script Text (Healthy Mom Happy Baby ♡) */}
                <Box
                  style={{
                    fontFamily: "var(--font-caveat), 'Caveat', cursive, sans-serif",
                    color: "#FF6B8B",
                    fontSize: "clamp(1.7rem, 2.5vw, 2.3rem)",
                    fontWeight: 700,
                    lineHeight: 1.05,
                    letterSpacing: "-0.01em",
                    transform: "rotate(-2deg)",
                    textShadow: "0 2px 8px rgba(255, 107, 139, 0.18)",
                  }}
                >
                  <div>Healthy</div>
                  <div style={{ paddingLeft: 6 }}>Mom</div>
                  <div style={{ paddingLeft: 4 }}>Happy</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, paddingLeft: 8 }}>
                    <span>Baby</span>
                    <span style={{ fontSize: "1.15em", transform: "translateY(-1px)" }}>♡</span>
                  </div>
                </Box>
              </Box>

              {/* Decorative Green Leaf Ribbon on Bottom-Right of Mother-Baby Circle (Matching Mockup) */}
              <Box
                style={{
                  position: "absolute",
                  bottom: "clamp(0px, 3%, 20px)",
                  right: "clamp(-10px, 1%, 20px)",
                  width: "clamp(100px, 14vw, 150px)",
                  height: "clamp(120px, 16vw, 170px)",
                  pointerEvents: "none",
                  zIndex: 1,
                }}
              >
                <svg width="100%" height="100%" viewBox="0 0 140 160" fill="none">
                  <defs>
                    <linearGradient id="bottomRightLeafGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#38A169" />
                      <stop offset="60%" stopColor="#4CAF7D" />
                      <stop offset="100%" stopColor="#86EFAC" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M15 150 C45 155 95 140 120 95 C135 65 130 25 125 5 C118 38 98 78 68 108 C42 130 22 142 15 150 Z"
                    fill="url(#bottomRightLeafGrad)"
                  />
                  <path
                    d="M30 140 C58 130 90 98 108 55"
                    stroke="#A7F3D0"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    opacity={0.65}
                  />
                </svg>
              </Box>
            </Box>
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}
