"use client";

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
  ThemeIcon,
} from "@mantine/core";
import {
  IconArrowRight,
  IconBabyCarriage,
  IconHeartHandshake,
  IconSparkles,
  IconShirt,
} from "@tabler/icons-react";
import { coreCategories, myOxygenColors } from "../tokens";

const categoryVisuals = [
  {
    image: "https://images.unsplash.com/photo-1522771739844-6a9f6d5f14af?w=600&auto=format&fit=crop&q=80",
    bgColor: "#FFF1F2",
    accentColor: myOxygenColors.primaryPink,
    icon: IconBabyCarriage,
  },
  {
    image: "https://images.unsplash.com/photo-1544126592-807ade215a0b?w=600&auto=format&fit=crop&q=80",
    bgColor: "#F0FDF4",
    accentColor: myOxygenColors.secondaryGreen,
    icon: IconHeartHandshake,
  },
  {
    image: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&auto=format&fit=crop&q=80",
    bgColor: "#FAF5FF",
    accentColor: myOxygenColors.accentPurple,
    icon: IconSparkles,
  },
  {
    image: "https://images.unsplash.com/photo-1596704017254-9b121068fb31?w=600&auto=format&fit=crop&q=80",
    bgColor: "#FFF1F2",
    accentColor: myOxygenColors.primaryPink,
    icon: IconShirt,
  },
];

export function CategoryGrid() {
  return (
    <Box py={{ base: 40, md: 60 }}>
      <Container size="xl">
        <SimpleGrid cols={{ base: 1, sm: 2, md: 4 }} spacing="lg">
          {coreCategories.map((cat, idx) => {
            const visual = categoryVisuals[idx] || categoryVisuals[0];
            const Icon = visual.icon;

            return (
              <Card
                key={cat.slug}
                padding="lg"
                radius="lg"
                style={{
                  backgroundColor: visual.bgColor,
                  border: "1px solid rgba(0, 0, 0, 0.04)",
                  transition: "transform 0.2s ease, box-shadow 0.2s ease",
                  cursor: "pointer",
                }}
              >
                <Card.Section>
                  <Box style={{ height: 180, overflow: "hidden" }}>
                    <Image
                      src={visual.image}
                      alt={cat.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </Box>
                </Card.Section>

                <Stack justify="space-between" mt="md" gap="xs">
                  <Group gap="xs">
                    <ThemeIcon
                      size={28}
                      radius="xl"
                      color={visual.accentColor}
                      variant="light"
                    >
                      <Icon size={16} />
                    </ThemeIcon>
                    <Text fw={700} size="lg" c={myOxygenColors.darkText}>
                      {cat.name}
                    </Text>
                  </Group>

                  <Text size="xs" c="dimmed" lineClamp={2}>
                    {cat.badge}
                  </Text>

                  <Button
                    variant="subtle"
                    color={visual.accentColor}
                    size="sm"
                    radius="xl"
                    p={0}
                    rightSection={<IconArrowRight size={14} />}
                    style={{ alignSelf: "flex-start", fontWeight: 700 }}
                  >
                    Explore
                  </Button>
                </Stack>
              </Card>
            );
          })}
        </SimpleGrid>
      </Container>
    </Box>
  );
}
