"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Container,
  Paper,
  Box,
  Title,
  Text,
  Button,
  Group,
  Stack,
  TextInput,
  Badge,
  SimpleGrid,
  ThemeIcon,
} from "@mantine/core";
import {
  IconSearch,
  IconHome,
  IconShoppingBag,
  IconArrowRight,
  IconBabyCarriage,
  IconHeartHandshake,
  IconSparkles,
  IconMilk,
  IconShieldHeart,
  IconHeadset,
} from "@tabler/icons-react";
import { Navbar } from "../components/Navbar";
import { Footer } from "../components/Footer";
import { myOxygenColors } from "../tokens";

const popularDestinations = [
  {
    title: "Newborn & Baby Care",
    description: "Diapers, wipes, gentle rash creams & baby bath essentials",
    href: "/categories/baby-care",
    icon: IconBabyCarriage,
    color: "#FF6B8B",
    bgColor: "#FFF0F3",
    badge: "Popular",
  },
  {
    title: "Motherhood & Maternity",
    description: "Postnatal nourishment, nursing comfort & stretch-mark care",
    href: "/categories/mother-care",
    icon: IconHeartHandshake,
    color: "#A78BFA",
    bgColor: "#F5F3FF",
    badge: "Mother Essentials",
  },
  {
    title: "Gentle Skin & Body",
    description: "Pediatrician-tested moisturizers, oils & hypoallergenic lotions",
    href: "/categories/skin-body-care",
    icon: IconShieldHeart,
    color: "#4CAF7D",
    bgColor: "#F0FDF4",
    badge: "Derm-Safe",
  },
  {
    title: "Today's Flash Deals",
    description: "Exclusive daily offers with FEFO batch verified discounts",
    href: "/products",
    icon: IconSparkles,
    color: "#F59E0B",
    bgColor: "#FEF3C7",
    badge: "Up to 30% Off",
  },
];

export function NotFoundClient() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/products?q=${encodeURIComponent(searchQuery.trim())}`);
    } else {
      router.push("/products");
    }
  };

  return (
    <Box
      style={{
        backgroundColor: "#FFF8F6",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Global Brand Navbar */}
      <Navbar />

      {/* Ambient background blur orbs */}
      <Box
        style={{
          position: "absolute",
          top: "15%",
          left: "5%",
          width: 380,
          height: 380,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(255, 107, 139, 0.12) 0%, rgba(255, 255, 255, 0) 70%)",
          filter: "blur(40px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />
      <Box
        style={{
          position: "absolute",
          top: "35%",
          right: "5%",
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167, 139, 250, 0.12) 0%, rgba(255, 255, 255, 0) 70%)",
          filter: "blur(50px)",
          pointerEvents: "none",
          zIndex: 0,
        }}
      />

      {/* Main 404 Content */}
      <Container size="md" py={{ base: 40, sm: 60 }} style={{ position: "relative", zIndex: 1 }}>
        <Stack align="center" gap="xl">
          {/* Status Badge */}
          <Badge
            size="lg"
            radius="xl"
            variant="light"
            color="pink"
            leftSection={<IconSparkles size={14} />}
            style={{
              backgroundColor: "#FFF0F3",
              border: "1px solid #FFE4EC",
              color: myOxygenColors.primaryPink,
              fontWeight: 700,
              padding: "8px 16px",
              textTransform: "none",
              fontSize: 13,
            }}
          >
            Page Not Found • Error 404
          </Badge>

          {/* Majestic 404 Graphic & Typography */}
          <Box style={{ position: "relative", textAlign: "center" }}>
            <Text
              style={{
                fontSize: "clamp(80px, 16vw, 130px)",
                fontWeight: 900,
                lineHeight: 0.9,
                fontFamily: "var(--font-poppins)",
                background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 45%, #A78BFA 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                letterSpacing: "-2px",
                userSelect: "none",
                textShadow: "0 10px 30px rgba(255, 107, 139, 0.2)",
              }}
            >
              404
            </Text>

            {/* Floating care icon badge overlay */}
            <Box
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: "#FFFFFF",
                boxShadow: "0 10px 25px rgba(255, 107, 139, 0.25)",
                border: "3px solid #FFF0F3",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: myOxygenColors.primaryPink,
              }}
            >
              <IconMilk size={32} />
            </Box>
          </Box>

          {/* Heading & Reassuring Copy */}
          <Stack align="center" gap="xs" style={{ maxWidth: 580, textAlign: "center" }}>
            <Title
              order={1}
              style={{
                fontFamily: "var(--font-poppins)",
                fontSize: "clamp(24px, 4vw, 32px)",
                fontWeight: 700,
                color: myOxygenColors.darkText,
              }}
            >
              Oops! This Care Page Took a Detour
            </Title>
            <Text size="md" c="dimmed" style={{ lineHeight: 1.6 }}>
              The page or product you are looking for may have been moved, renamed, or is temporarily taking a gentle nap. Don't worry, all our mother and baby essentials are just a click away!
            </Text>
          </Stack>

          {/* Embedded Quick Search Box */}
          <Paper
            radius="xl"
            p="sm"
            withBorder
            style={{
              width: "100%",
              maxWidth: 540,
              backgroundColor: "#FFFFFF",
              borderColor: "#FFE4EC",
              boxShadow: "0 10px 30px rgba(255, 107, 139, 0.08)",
            }}
          >
            <form onSubmit={handleSearchSubmit}>
              <Group gap="xs" wrap="nowrap">
                <TextInput
                  placeholder="Search baby diapers, mother care, skin lotion..."
                  size="md"
                  radius="xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  leftSection={<IconSearch size={18} color="#9CA3AF" />}
                  style={{ flex: 1 }}
                  styles={{
                    input: {
                      border: "none",
                      backgroundColor: "transparent",
                    },
                  }}
                />
                <Button
                  type="submit"
                  size="md"
                  radius="xl"
                  style={{
                    backgroundColor: myOxygenColors.primaryPink,
                    paddingLeft: 22,
                    paddingRight: 22,
                    fontWeight: 600,
                    boxShadow: "0 4px 14px rgba(255, 107, 139, 0.35)",
                  }}
                >
                  Search
                </Button>
              </Group>
            </form>
          </Paper>

          {/* Main Action Buttons */}
          <Group gap="md" mt={8}>
            <Button
              component={Link}
              href="/"
              size="lg"
              radius="xl"
              leftSection={<IconHome size={20} />}
              style={{
                backgroundColor: myOxygenColors.primaryPink,
                boxShadow: "0 6px 18px rgba(255, 107, 139, 0.35)",
                fontWeight: 600,
              }}
            >
              Back to Home
            </Button>

            <Button
              component={Link}
              href="/products"
              size="lg"
              radius="xl"
              variant="outline"
              color="pink"
              leftSection={<IconShoppingBag size={20} />}
              style={{
                borderColor: "#FF6B8B",
                color: "#FF6B8B",
                backgroundColor: "#FFFFFF",
                fontWeight: 600,
              }}
            >
              Browse All Products
            </Button>
          </Group>

          {/* Popular Care Categories Grid */}
          <Box style={{ width: "100%", marginTop: 24 }}>
            <Text fw={700} size="sm" c="dimmed" ta="center" mb="lg" style={{ letterSpacing: "0.5px", textTransform: "uppercase" }}>
              Or explore our most popular care categories
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              {popularDestinations.map((dest) => {
                const Icon = dest.icon;
                return (
                  <Paper
                    key={dest.title}
                    component={Link}
                    href={dest.href}
                    p="lg"
                    radius="lg"
                    withBorder
                    style={{
                      textDecoration: "none",
                      backgroundColor: "#FFFFFF",
                      borderColor: "#FFE4EC",
                      transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                    styles={{
                      root: {
                        "&:hover": {
                          transform: "translateY(-4px)",
                          borderColor: dest.color,
                          boxShadow: `0 12px 28px ${dest.color}20`,
                        },
                      },
                    }}
                  >
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <Group gap="sm">
                        <ThemeIcon
                          size={44}
                          radius="md"
                          style={{
                            backgroundColor: dest.bgColor,
                            color: dest.color,
                          }}
                        >
                          <Icon size={24} />
                        </ThemeIcon>
                        <Box>
                          <Text fw={700} size="md" c={myOxygenColors.darkText} style={{ fontFamily: "var(--font-poppins)" }}>
                            {dest.title}
                          </Text>
                          <Badge size="xs" radius="sm" variant="light" color="gray" mt={2}>
                            {dest.badge}
                          </Badge>
                        </Box>
                      </Group>

                      <ThemeIcon
                        size={28}
                        radius="xl"
                        variant="subtle"
                        color="pink"
                        style={{ alignSelf: "center" }}
                      >
                        <IconArrowRight size={18} />
                      </ThemeIcon>
                    </Group>

                    <Text size="xs" c="dimmed" mt="xs" style={{ lineHeight: 1.5 }}>
                      {dest.description}
                    </Text>
                  </Paper>
                );
              })}
            </SimpleGrid>
          </Box>

          {/* Immediate Care Support Banner */}
          <Paper
            radius="xl"
            p="md"
            mt="md"
            style={{
              backgroundColor: "#FFF0F3",
              border: "1px dashed #FF6B8B",
              width: "100%",
            }}
          >
            <Group justify="center" align="center" gap="sm" wrap="wrap">
              <ThemeIcon size={32} radius="xl" color="pink">
                <IconHeadset size={18} />
              </ThemeIcon>
              <Text size="sm" c={myOxygenColors.darkText}>
                Need assistance with an existing order or finding a product? Call our Dhaka Care Helpline at{" "}
                <Text component="span" fw={700} c={myOxygenColors.primaryPink}>
                  +880 1700-000000
                </Text>{" "}
                (Daily 9 AM – 10 PM)
              </Text>
            </Group>
          </Paper>
        </Stack>
      </Container>

      {/* Global Brand Footer */}
      <Footer />
    </Box>
  );
}
