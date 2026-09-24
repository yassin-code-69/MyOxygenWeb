"use client";

import Link from "next/link";
import { Container, Card, Grid, Title, Text, Button, Box, Image } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import { myOxygenColors } from "../tokens";

export function SpecialCareBanner() {
  return (
    <Box py={{ base: 25, md: 45 }}>
      <Container size="xl">
        <Card
          radius={28}
          p={{ base: "lg", md: 36 }}
          style={{
            background: "linear-gradient(135deg, #FFF1F4 0%, #FFE4E8 100%)",
            border: "1px solid #FECDD3",
            position: "relative",
            overflow: "hidden",
            boxShadow: "0 10px 30px rgba(255, 107, 139, 0.08)",
          }}
        >
          {/* Subtle ambient decorative circle */}
          <Box
            style={{
              position: "absolute",
              top: -50,
              right: 150,
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: "rgba(255, 255, 255, 0.4)",
              pointerEvents: "none",
            }}
          />

          <Grid align="center" gap="xl">
            {/* Left Content */}
            <Grid.Col span={{ base: 12, md: 7 }}>
              <Title
                order={2}
                style={{
                  fontSize: "clamp(1.6rem, 3.2vw, 2.3rem)",
                  fontWeight: 800,
                  color: myOxygenColors.darkText,
                  fontFamily: "var(--font-poppins)",
                  lineHeight: 1.2,
                }}
              >
                Special Care for Your Little One
              </Title>

              <Text
                size="md"
                mt="xs"
                style={{
                  color: myOxygenColors.textGray,
                  fontWeight: 600,
                  letterSpacing: "0.02em",
                }}
              >
                Safe | Gentle | Trusted
              </Text>

              <Box mt="xl">
                <Button
                  component={Link}
                  href="/categories/newborn"
                  radius="xl"
                  size="md"
                  rightSection={<IconArrowRight size={16} stroke={2.5} />}
                  style={{
                    backgroundColor: myOxygenColors.primaryPink,
                    color: "#FFFFFF",
                    fontWeight: 700,
                    padding: "0 28px",
                    height: 44,
                    boxShadow: "0 6px 20px rgba(255, 107, 139, 0.35)",
                    transition: "transform 0.15s ease",
                  }}
                >
                  Shop Newborn
                </Button>
              </Box>
            </Grid.Col>

            {/* Right Image */}
            <Grid.Col span={{ base: 12, md: 5 }}>
              <Box
                style={{
                  height: 220,
                  borderRadius: 22,
                  overflow: "hidden",
                  boxShadow: "0 10px 25px rgba(255, 107, 139, 0.12)",
                  border: "4px solid #FFFFFF",
                  backgroundColor: "#FFFFFF",
                }}
              >
                <Image
                  src="/images/banner-baby.jpg"
                  alt="Special Care for Your Little One"
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "center 30%",
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
