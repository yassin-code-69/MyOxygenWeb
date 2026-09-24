"use client";

import Link from "next/link";
import {
  Container,
  SimpleGrid,
  Card,
  Image,
  Text,
  Button,
  Stack,
  Box,
  Group,
} from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

const categories = [
  {
    name: "Newborn",
    slug: "newborn",
    subtitle: "Essentials for your little bundle of joy",
    image: "/images/cat-newborn.jpg",
    icon: "/icons/newborn.svg",
    bgColor: "#FFF1F2",
    borderColor: "#FFE4E8",
    btnColor: "#FF6B8B",
    btnShadow: "rgba(255, 107, 139, 0.3)",
  },
  {
    name: "Mother Care",
    slug: "mother-care",
    subtitle: "Complete care for healthy motherhood",
    image: "/images/cat-mothercare.jpg",
    icon: "/icons/mother-care.svg",
    bgColor: "#ECFDF5",
    borderColor: "#D1FAE5",
    btnColor: "#4CAF7D",
    btnShadow: "rgba(76, 175, 125, 0.3)",
  },
  {
    name: "Skin Care",
    slug: "skin-care",
    subtitle: "Natural care for your glowing skin",
    image: "/images/cat-skincare.jpg",
    icon: "/icons/skin-care.svg",
    bgColor: "#F5F3FF",
    borderColor: "#EDE9FE",
    btnColor: "#A78BFA",
    btnShadow: "rgba(167, 139, 250, 0.3)",
  },
  {
    name: "Inner Wear",
    slug: "inner-wear",
    subtitle: "Comfortable & confident every day",
    image: "/images/cat-innerwear.jpg",
    icon: "/icons/inner-wear.svg",
    bgColor: "#FFF1F2",
    borderColor: "#FFE4E8",
    btnColor: "#FF6B8B",
    btnShadow: "rgba(255, 107, 139, 0.3)",
  },
];

export function CategoryGrid() {
  return (
    <Box py={{ base: 35, md: 55 }}>
      <Container size="xl">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
          {categories.map((cat) => (
            <Card
              key={cat.slug}
              padding="md"
              radius={24}
              style={{
                backgroundColor: cat.bgColor,
                border: `1px solid ${cat.borderColor}`,
                boxShadow: "0 6px 20px rgba(0, 0, 0, 0.03)",
                transition: "transform 0.25s ease, box-shadow 0.25s ease",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
              }}
            >
              {/* Category Image */}
              <Box
                style={{
                  height: 200,
                  borderRadius: 18,
                  overflow: "hidden",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Image
                  src={cat.image}
                  alt={cat.name}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    transition: "transform 0.4s ease",
                  }}
                />
              </Box>

              {/* Category Details */}
              <Stack gap="xs" mt="md" style={{ flexGrow: 1 }}>
                <Group gap="xs" align="center" wrap="nowrap">
                  <Box
                    style={{
                      width: 32,
                      height: 32,
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Image
                      src={cat.icon}
                      alt={cat.name}
                      w={32}
                      h={32}
                      fit="contain"
                    />
                  </Box>
                  <Text
                    fw={800}
                    size="lg"
                    c={myOxygenColors.darkText}
                    style={{ fontFamily: "var(--font-poppins)" }}
                  >
                    {cat.name}
                  </Text>
                </Group>

                <Text
                  size="xs"
                  c={myOxygenColors.textGray}
                  style={{ minHeight: 34, lineHeight: 1.4 }}
                >
                  {cat.subtitle}
                </Text>

                {/* Explore Pill Button */}
                <Box pt={4}>
                  <Button
                    component={Link}
                    href={`/categories/${cat.slug}`}
                    radius="xl"
                    size="xs"
                    rightSection={<IconArrowRight size={14} />}
                    style={{
                      backgroundColor: cat.btnColor,
                      color: "#FFFFFF",
                      fontWeight: 700,
                      padding: "0 18px",
                      height: 32,
                      boxShadow: `0 4px 12px ${cat.btnShadow}`,
                      transition: "transform 0.15s ease",
                    }}
                  >
                    Explore
                  </Button>
                </Box>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
