"use client";

import Link from "next/link";
import {
  Container,
  Group,
  Text,
  Box,
  Divider,
  SimpleGrid,
  Stack,
  TextInput,
  ActionIcon,
  Image,
} from "@mantine/core";
import {
  IconShieldCheck,
  IconAward,
  IconClock,
  IconSend,
  IconLeaf,
  IconHeart,
} from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

export interface FooterProps {
  mt?: any;
  style?: React.CSSProperties;
  showAccentStrip?: boolean;
}

export function Footer({ mt = 60, style, showAccentStrip = false }: FooterProps = {}) {
  return (
    <Box
      component="footer"
      mt={mt}
      style={{
        backgroundColor: "#FFF8F6",
        borderTop: "1px solid #FFE4EC",
        ...style,
      }}
    >
      {/* Optional Top Accent Banner Strip (Matching Mockup) */}
      {showAccentStrip && (
        <Box
          py={12}
          px={24}
          style={{
            backgroundColor: "#FFF0F3",
            borderBottom: "1px solid #FFE4EC",
          }}
        >
          <Container size="xl">
            <Group justify="space-between" align="center">
              <Group gap={8}>
                <Box style={{ width: 14, height: 14 }}>
                  <svg viewBox="0 0 24 24" fill="#4CAF7D">
                    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66l.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
                  </svg>
                </Box>
                <Text size="xs" fw={600} c="#6B7280">
                  Better Care • Happier Tomorrow
                </Text>
              </Group>

              <Group gap={6}>
                <Text
                  style={{
                    fontFamily: "var(--font-caveat), 'Caveat', cursive",
                    color: "#FF6B8B",
                    fontSize: "1.3rem",
                    fontWeight: 700,
                  }}
                >
                  My Oxygen ♡
                </Text>
                <Box style={{ width: 14, height: 14 }}>
                  <svg viewBox="0 0 24 24" fill="#4CAF7D">
                    <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66l.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
                  </svg>
                </Box>
              </Group>
            </Group>
          </Container>
        </Box>
      )}

      <Container size="xl" pt={showAccentStrip ? 20 : 40} pb={40}>
        {/* Top Brand & Trust Showcase Row (Matching Style Guide Mockup) */}
        <Group justify="space-between" align="center" wrap="wrap" gap="lg" mb={35}>
          {/* Brand Identity & Tagline */}
          <Group gap="lg" align="center" wrap="wrap">
            <Link href="/" style={{ textDecoration: "none" }}>
              <Group gap="xs">
                <Box
                  style={{
                    width: 42,
                    height: 42,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    src="/icons/logo-heart.svg"
                    alt="My Oxygen"
                    w={42}
                    h={42}
                    fit="contain"
                  />
                </Box>
                <Box>
                  <Text
                    fw={800}
                    size="xl"
                    style={{
                      color: myOxygenColors.primaryPink,
                      fontFamily: "var(--font-poppins)",
                      lineHeight: 1.1,
                      letterSpacing: "-0.01em",
                    }}
                  >
                    My Oxygen
                  </Text>
                  <Text size="11px" c="dimmed" fw={500} style={{ letterSpacing: "0.02em" }}>
                    Healthy Life • Happy You
                  </Text>
                </Box>
              </Group>
            </Link>

            {/* Slogan with Leaf & Heart */}
            <Group gap={6} align="center" visibleFrom="sm" ml="md">
              <IconLeaf size={18} color="#4CAF7D" />
              <Text
                size="sm"
                fw={600}
                style={{
                  color: "#4CAF7D",
                  fontStyle: "italic",
                  fontFamily: "var(--font-inter)",
                }}
              >
                For a Healthier Brighter Tomorrow ♡
              </Text>
            </Group>
          </Group>

          {/* Trust Badges Capsule (Theme-Aligned Pure White Surface) */}
          <Box
            style={{
              backgroundColor: "#FFFFFF",
              borderRadius: 9999,
              padding: "8px 22px",
              border: "1px solid #FFE4EC",
              boxShadow: "0 4px 16px rgba(255, 107, 139, 0.08)",
            }}
          >
            <Group gap="lg" align="center">
              <Group gap={8}>
                <Box
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "#EDFBF3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconShieldCheck size={16} color="#4CAF7D" />
                </Box>
                <Text size="xs" fw={700} c={myOxygenColors.darkText}>
                  Quality Products
                </Text>
              </Group>

              <Group gap={8}>
                <Box
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "#EDFBF3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconAward size={16} color="#4CAF7D" />
                </Box>
                <Text size="xs" fw={700} c={myOxygenColors.darkText}>
                  Trusted Brand
                </Text>
              </Group>

              <Group gap={8}>
                <Box
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    backgroundColor: "#EDFBF3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconClock size={16} color="#4CAF7D" />
                </Box>
                <Text size="xs" fw={700} c={myOxygenColors.darkText}>
                  24/7 Support
                </Text>
              </Group>
            </Group>
          </Box>
        </Group>

        <Divider color="#FFE4EC" mb={35} />

        {/* Main Footer Links & Info Grid */}
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing={35}>
          {/* Col 1: About the Brand */}
          <Stack gap="sm">
            <Text fw={700} size="md" c={myOxygenColors.darkText} style={{ fontFamily: "var(--font-poppins)" }}>
              About My Oxygen
            </Text>
            <Text size="sm" c={myOxygenColors.textGray} style={{ lineHeight: 1.6 }}>
              From newborn care to motherhood, skincare and inner wear — all essentials for every stage of life across Bangladesh.
            </Text>
            <Group gap={6} align="center" mt={4}>
              <IconLeaf size={15} color="#4CAF7D" />
              <Text
                size="xs"
                fw={600}
                style={{
                  color: myOxygenColors.primaryPink,
                  fontStyle: "italic",
                }}
              >
                Because You Deserve the Best
              </Text>
              <IconHeart size={13} color={myOxygenColors.primaryPink} fill={myOxygenColors.primaryPink} />
            </Group>
          </Stack>

          {/* Col 2: Categories */}
          <Stack gap="xs">
            <Text fw={700} size="md" c={myOxygenColors.darkText} style={{ fontFamily: "var(--font-poppins)" }}>
              Categories
            </Text>
            <Stack gap={8} mt={2}>
              <Text
                component={Link}
                href="/categories/newborn"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                Newborn Care
              </Text>
              <Text
                component={Link}
                href="/categories/mother-care"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                Mother Care
              </Text>
              <Text
                component={Link}
                href="/categories/skin-care"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                Skin Care
              </Text>
              <Text
                component={Link}
                href="/categories/inner-wear"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                Inner Wear
              </Text>
            </Stack>
          </Stack>

          {/* Col 3: Customer Care & Quick Links */}
          <Stack gap="xs">
            <Text fw={700} size="md" c={myOxygenColors.darkText} style={{ fontFamily: "var(--font-poppins)" }}>
              Customer Care
            </Text>
            <Stack gap={8} mt={2}>
              <Text
                component={Link}
                href="/products"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                All Products
              </Text>
              <Text
                component={Link}
                href="/orders"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                Track Order
              </Text>
              <Text
                component={Link}
                href="/products"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                About Us
              </Text>
              <Text
                component={Link}
                href="/products"
                size="sm"
                c={myOxygenColors.textGray}
                style={{ textDecoration: "none", transition: "color 0.2s" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = myOxygenColors.primaryPink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = myOxygenColors.textGray)}
              >
                Privacy &amp; Policy
              </Text>
            </Stack>
          </Stack>

          {/* Col 4: Newsletter Subscription (Matching Style Guide Input Field) */}
          <Stack gap="xs">
            <Text fw={700} size="md" c={myOxygenColors.darkText} style={{ fontFamily: "var(--font-poppins)" }}>
              Stay Connected
            </Text>
            <Text size="xs" c={myOxygenColors.textGray} style={{ lineHeight: 1.5 }}>
              Subscribe for exclusive mother &amp; baby wellness updates and special offers.
            </Text>

            <Box mt={8}>
              <TextInput
                placeholder="Enter your email address"
                radius="xl"
                size="md"
                rightSectionWidth={44}
                rightSection={
                  <ActionIcon
                    size={32}
                    radius="xl"
                    style={{
                      backgroundColor: myOxygenColors.primaryPink,
                      color: "#FFFFFF",
                      boxShadow: "0 2px 8px rgba(255, 107, 139, 0.35)",
                      marginRight: 4,
                      transition: "transform 0.15s ease, background-color 0.15s ease",
                    }}
                    styles={{
                      root: {
                        "&:hover": {
                          backgroundColor: "#F472B6",
                          transform: "scale(1.05)",
                        },
                      },
                    }}
                    aria-label="Subscribe to newsletter"
                  >
                    <IconSend size={15} stroke={2} />
                  </ActionIcon>
                }
                styles={{
                  input: {
                    backgroundColor: "#FFFFFF",
                    borderColor: "#FFE4EC",
                    borderWidth: 1.5,
                    color: myOxygenColors.darkText,
                    height: 44,
                    paddingLeft: 18,
                    paddingRight: 48,
                    fontSize: "0.88rem",
                    boxShadow: "0 2px 8px rgba(255, 107, 139, 0.04)",
                    "&::placeholder": {
                      color: "#9CA3AF",
                    },
                    "&:focus": {
                      borderColor: myOxygenColors.primaryPink,
                      boxShadow: "0 0 0 3px rgba(255, 107, 139, 0.12)",
                    },
                  },
                }}
              />
            </Box>
          </Stack>
        </SimpleGrid>

        <Divider color="#FFE4EC" my={30} />

        {/* Bottom Bar: Copyright & Subtitle */}
        <Group justify="space-between" align="center" wrap="wrap" gap="sm">
          <Text size="xs" c={myOxygenColors.textGray}>
            © 2026 My Oxygen. All rights reserved.
          </Text>
          <Text size="xs" c={myOxygenColors.textGray}>
            Healthy Life • Happy You — For a Healthier Brighter Tomorrow ♡
          </Text>
        </Group>
      </Container>
    </Box>
  );
}
