"use client";

import { Container, Group, Text, Box, Divider } from "@mantine/core";
import {
  IconHeartHandshake,
  IconShieldCheck,
  IconAward,
  IconHeadset,
} from "@tabler/icons-react";

export function Footer() {
  return (
    <Box
      component="footer"
      mt={60}
      style={{
        backgroundColor: "#1F2937",
        color: "#F9FAFB",
        paddingTop: 50,
        paddingBottom: 40,
      }}
    >
      <Container size="xl">
        <Group justify="space-between" align="center" wrap="wrap" gap="xl">
          {/* Logo & Slogan */}
          <Group gap="sm">
            <Box
              style={{
                width: 42,
                height: 42,
                borderRadius: "50%",
                background: "linear-gradient(135deg, #FF6B8B 0%, #4CAF7D 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#FFFFFF",
              }}
            >
              <IconHeartHandshake size={24} />
            </Box>
            <Box>
              <Text fw={800} size="xl" c="#FFFFFF" style={{ fontFamily: "var(--font-poppins)" }}>
                My Oxygen
              </Text>
              <Text size="xs" c="dimmed">
                Healthy Life • Happy You
              </Text>
            </Box>
          </Group>

          {/* Slogan */}
          <Text size="md" fw={600} c="#F472B6">
            For a Healthier Brighter Tomorrow ♡
          </Text>

          {/* Trust points */}
          <Group gap="lg">
            <Group gap={6}>
              <IconAward size={18} color="#4CAF7D" />
              <Text size="sm" fw={600}>
                Quality Products
              </Text>
            </Group>
            <Group gap={6}>
              <IconShieldCheck size={18} color="#4CAF7D" />
              <Text size="sm" fw={600}>
                Trusted Brand
              </Text>
            </Group>
            <Group gap={6}>
              <IconHeadset size={18} color="#4CAF7D" />
              <Text size="sm" fw={600}>
                24/7 Support
              </Text>
            </Group>
          </Group>
        </Group>

        <Divider my="xl" color="rgba(255,255,255,0.1)" />

        <Group justify="space-between" align="center">
          <Text size="xs" c="dimmed">
            © 2026 My Oxygen Single-Owner Retail. All rights reserved.
          </Text>
          <Text size="xs" c="dimmed">
            From Newborn to Motherhood • All Essentials for Every Stage of Life
          </Text>
        </Group>
      </Container>
    </Box>
  );
}
