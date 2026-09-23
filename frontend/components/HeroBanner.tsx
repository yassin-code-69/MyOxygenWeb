"use client";

import {
  Container,
  Grid,
  Stack,
  Title,
  Text,
  Button,
  Badge,
  Box,
  Image,
} from "@mantine/core";
import { IconArrowRight, IconHeart } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

export function HeroBanner() {
  return (
    <Box
      py={{ base: 40, md: 70 }}
      style={{
        background: "radial-gradient(circle at 80% 20%, #FFE4E6 0%, #FFF8F6 70%)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Container size="xl">
        <Grid align="center" gap="xl">
          <Grid.Col span={{ base: 12, md: 6 }}>
            <Stack gap="md">
              <Badge
                variant="light"
                color="secondaryGreen"
                size="lg"
                radius="xl"
                style={{ width: "fit-content" }}
              >
                Care for Every Stage
              </Badge>

              <Title
                order={1}
                style={{
                  fontSize: "clamp(2rem, 4vw, 3.2rem)",
                  fontWeight: 800,
                  color: myOxygenColors.darkText,
                  lineHeight: 1.15,
                  fontFamily: "var(--font-poppins)",
                }}
              >
                Your Health,{" "}
                <Text
                  component="span"
                  inherit
                  style={{
                    color: myOxygenColors.primaryPink,
                    display: "inline",
                  }}
                >
                  Our Priority
                </Text>
              </Title>

              <Text size="lg" c="dimmed" maw={480} style={{ lineHeight: 1.6 }}>
                From newborn care to motherhood, skincare and inner wear —
                everything you need, all in one place. Safe, gentle, and
                dermatologically trusted for you and your loved ones.
              </Text>

              <Box pt="xs">
                <Button
                  size="lg"
                  radius="xl"
                  color="primaryPink"
                  rightSection={<IconArrowRight size={18} />}
                  style={{
                    boxShadow: "0 8px 25px rgba(255, 107, 139, 0.4)",
                    fontWeight: 700,
                  }}
                >
                  Shop Now
                </Button>
              </Box>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 12, md: 6 }}>
            <Box style={{ position: "relative", textAlign: "center" }}>
              {/* Circular Decorative Background */}
              <Box
                style={{
                  width: "clamp(280px, 40vw, 440px)",
                  height: "clamp(280px, 40vw, 440px)",
                  borderRadius: "50%",
                  background:
                    "linear-gradient(135deg, rgba(255, 107, 139, 0.2) 0%, rgba(76, 175, 125, 0.2) 100%)",
                  margin: "0 auto",
                  position: "relative",
                  overflow: "hidden",
                  border: "8px solid #FFFFFF",
                  boxShadow: "0 20px 40px rgba(0, 0, 0, 0.08)",
                }}
              >
                <Image
                  src="https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=800&auto=format&fit=crop&q=80"
                  alt="Mother and newborn baby"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </Box>

              {/* Floating Trust Pill */}
              <Box
                style={{
                  position: "absolute",
                  bottom: 20,
                  right: 40,
                  backgroundColor: "#FFFFFF",
                  padding: "10px 18px",
                  borderRadius: "9999px",
                  boxShadow: "0 10px 25px rgba(0, 0, 0, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <IconHeart size={18} color={myOxygenColors.primaryPink} fill={myOxygenColors.primaryPink} />
                <Text fw={700} size="sm" c={myOxygenColors.darkText}>
                  Healthy Mom • Happy Baby
                </Text>
              </Box>
            </Box>
          </Grid.Col>
        </Grid>
      </Container>
    </Box>
  );
}
