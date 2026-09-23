"use client";

import { Container, Card, Grid, Title, Text, Button, Box, Image } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

export function SpecialCareBanner() {
  return (
    <Box py={{ base: 20, md: 40 }}>
      <Container size="xl">
        <Card
          radius="xl"
          p={{ base: "lg", md: "xl" }}
          style={{
            background: "linear-gradient(135deg, #FFF0F3 0%, #FFE4E6 100%)",
            border: "1px solid #FECDD3",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <Grid align="center" gap="xl">
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Title
                order={2}
                style={{
                  fontSize: "clamp(1.5rem, 3vw, 2.2rem)",
                  fontWeight: 800,
                  color: myOxygenColors.darkText,
                  fontFamily: "var(--font-poppins)",
                }}
              >
                Special Care for Your Little One
              </Title>
              <Text size="md" c="dimmed" mt="xs" fw={500}>
                Safe • Gentle • Trusted Essentials across Bangladesh
              </Text>
              <Button
                radius="xl"
                color="primaryPink"
                size="md"
                mt="lg"
                rightSection={<IconArrowRight size={16} />}
                fw={700}
                style={{
                  boxShadow: "0 6px 18px rgba(255, 107, 139, 0.35)",
                }}
              >
                Shop Newborn
              </Button>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 5 }}>
              <Box
                style={{
                  height: 180,
                  borderRadius: "16px",
                  overflow: "hidden",
                  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                }}
              >
                <Image
                  src="https://images.unsplash.com/photo-1519689680058-324335c77eba?w=800&auto=format&fit=crop&q=80"
                  alt="Cute baby sleeping"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </Box>
            </Grid.Col>
          </Grid>
        </Card>
      </Container>
    </Box>
  );
}
