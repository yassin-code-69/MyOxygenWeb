"use client";

import { Container, SimpleGrid, Group, Text, Box, ThemeIcon } from "@mantine/core";
import {
  IconAward,
  IconShieldCheck,
  IconTruckDelivery,
  IconCreditCard,
} from "@tabler/icons-react";
import { trustBadges, myOxygenColors } from "../tokens";

const iconMap = [
  IconAward,
  IconShieldCheck,
  IconTruckDelivery,
  IconCreditCard,
];

export function FeaturesBar() {
  return (
    <Box
      py="md"
      style={{
        backgroundColor: "#FFFFFF",
        borderTop: "1px solid #FFF0F3",
        borderBottom: "1px solid #FFF0F3",
      }}
    >
      <Container size="xl">
        <SimpleGrid cols={{ base: 2, md: 4 }} spacing="md">
          {trustBadges.map((badge, idx) => {
            const IconComponent = iconMap[idx] || IconAward;
            return (
              <Group key={badge.title} gap="sm" wrap="nowrap">
                <ThemeIcon
                  size={42}
                  radius="xl"
                  variant="light"
                  color={idx % 2 === 0 ? "primaryPink" : "secondaryGreen"}
                  style={{ flexShrink: 0 }}
                >
                  <IconComponent size={22} />
                </ThemeIcon>
                <Box>
                  <Text fw={700} size="sm" c={myOxygenColors.darkText}>
                    {badge.title}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {badge.subtitle}
                  </Text>
                </Box>
              </Group>
            );
          })}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
