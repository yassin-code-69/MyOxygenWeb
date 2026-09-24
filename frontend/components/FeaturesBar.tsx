"use client";

import { Container, SimpleGrid, Group, Text, Box, ThemeIcon } from "@mantine/core";
import {
  IconShieldCheck,
  IconPlant2,
  IconTruckDelivery,
  IconCreditCard,
} from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

const trustFeatures = [
  {
    title: "Premium Quality",
    subtitle: "Trusted Products",
    icon: IconShieldCheck,
    color: "#FF6B8B",
    bgColor: "#FFF0F3",
  },
  {
    title: "Safe & Natural",
    subtitle: "For Your Loved Ones",
    icon: IconPlant2,
    color: "#4CAF7D",
    bgColor: "#EDFBF3",
  },
  {
    title: "Fast Delivery",
    subtitle: "Across Bangladesh",
    icon: IconTruckDelivery,
    color: "#A78BFA",
    bgColor: "#F5F3FF",
  },
  {
    title: "Secure Payment",
    subtitle: "Multiple Options",
    icon: IconCreditCard,
    color: "#FF6B8B",
    bgColor: "#FFF1F2",
  },
];

export function FeaturesBar() {
  return (
    <Box py={{ base: "sm", md: "md" }} style={{ position: "relative", zIndex: 10 }}>
      <Container size="xl">
        <Box
          p={{ base: "md", md: "lg" }}
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            border: "1px solid #FFE4EC",
            boxShadow: "0 6px 24px rgba(255, 107, 139, 0.05)",
          }}
        >
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing={{ base: "md", md: "xl" }}>
            {trustFeatures.map((item) => {
              const Icon = item.icon;
              return (
                <Group
                  key={item.title}
                  gap="sm"
                  wrap="nowrap"
                  style={{
                    padding: "4px 8px",
                  }}
                >
                  <ThemeIcon
                    size={46}
                    radius="xl"
                    style={{
                      backgroundColor: item.bgColor,
                      color: item.color,
                      flexShrink: 0,
                      border: `1px solid ${item.color}22`,
                    }}
                  >
                    <Icon size={22} stroke={2} />
                  </ThemeIcon>
                  <Box>
                    <Text fw={700} size="sm" c={myOxygenColors.darkText} style={{ lineHeight: 1.25 }}>
                      {item.title}
                    </Text>
                    <Text size="xs" c="dimmed" mt={3} style={{ lineHeight: 1.25 }}>
                      {item.subtitle}
                    </Text>
                  </Box>
                </Group>
              );
            })}
          </SimpleGrid>
        </Box>
      </Container>
    </Box>
  );
}
