"use client";

import { Box, Group, Paper, Stack, Text, Title } from "@mantine/core";
import { IconCheck } from "@tabler/icons-react";
import { motion, useReducedMotion } from "motion/react";
import { formatBDT } from "../../lib/format";
import { brand, colors, semantic, shadows } from "../../tokens";
import { springs } from "../../tokens/motion";
import type { PaymentMethod } from "../../types/order";

const CONFETTI_COLORS = [
  brand.primary,
  brand.secondary,
  brand.accent,
  colors.warning[4],
  colors.primary[3],
  colors.info[4],
] as const;

const PIECES = 20;

/** Deterministic burst (no randomness → stable across renders). */
const CONFETTI = Array.from({ length: PIECES }, (_, index) => {
  const angle = (index / PIECES) * Math.PI * 2 + (index % 2 === 0 ? 0.12 : -0.08);
  const distance = 92 + (index % 4) * 26;
  return {
    id: index,
    x: Math.round(Math.cos(angle) * distance),
    y: Math.round(Math.sin(angle) * distance * 0.75),
    rotate: (index % 2 === 0 ? 1 : -1) * (120 + index * 17),
    color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
    round: index % 3 === 0,
    delay: (index % 5) * 0.02,
  };
});

function Confetti() {
  return (
    <Box
      aria-hidden
      style={{ position: "absolute", left: "50%", top: 72, width: 0, height: 0, pointerEvents: "none" }}
    >
      {CONFETTI.map((piece) => (
        <motion.span
          key={piece.id}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0.4, rotate: 0 }}
          // Every keyframe track has three stops so they share `times`.
          animate={{
            x: [0, piece.x, Math.round(piece.x * 1.08)],
            y: [0, piece.y, piece.y + 48],
            opacity: [0, 1, 0],
            scale: [0.4, 1, 0.8],
            rotate: [0, piece.rotate / 2, piece.rotate],
          }}
          transition={{ duration: 1.6, delay: 0.15 + piece.delay, ease: "easeOut", times: [0, 0.4, 1] }}
          style={{
            position: "absolute",
            width: piece.round ? 8 : 7,
            height: piece.round ? 8 : 12,
            marginLeft: -4,
            marginTop: -6,
            borderRadius: piece.round ? "50%" : 2,
            backgroundColor: piece.color,
          }}
        />
      ))}
    </Box>
  );
}

export interface OrderSuccessHeroProps {
  orderNumber: string;
  total: number;
  paymentMethod: PaymentMethod;
}

/** "Order placed" celebration: spring checkmark + a short confetti burst (skipped under reduced motion). */
export function OrderSuccessHero({ orderNumber, total, paymentMethod }: OrderSuccessHeroProps) {
  const reduceMotion = useReducedMotion();

  return (
    <Paper
      withBorder
      radius="md"
      p={{ base: "lg", sm: "xl" }}
      mb="lg"
      bg={semantic.surface}
      shadow="card"
      style={{ position: "relative", overflow: "hidden", textAlign: "center" }}
    >
      {reduceMotion ? null : <Confetti />}
      <Stack align="center" gap="sm" role="status" aria-live="polite">
        <motion.div
          initial={reduceMotion ? { opacity: 0 } : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={springs.bouncy}
          style={{
            width: 76,
            height: 76,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: brand.secondary,
            color: semantic.textOnPrimary,
            boxShadow: shadows.buttonSecondary,
          }}
        >
          <motion.span
            initial={reduceMotion ? { opacity: 0 } : { scale: 0.3, opacity: 0, rotate: -25 }}
            animate={{ scale: 1, opacity: 1, rotate: 0 }}
            transition={{ ...springs.bouncy, delay: 0.12 }}
            style={{ display: "inline-flex" }}
          >
            <IconCheck size={42} stroke={3} aria-hidden />
          </motion.span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: reduceMotion ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.2, ease: "easeOut" }}
        >
          <Stack align="center" gap={8}>
            <Title order={1} size="h2" c={semantic.text}>
              Thank you — your order is placed!
            </Title>
            <Group
              gap={6}
              px="md"
              py={6}
              style={{
                borderRadius: "var(--mantine-radius-xl)",
                border: `1px dashed ${brand.primary}`,
                backgroundColor: semantic.surfaceBrandTint,
              }}
            >
              <Text size="sm" c={semantic.textMutedOnTint}>
                Order number
              </Text>
              <Text size="sm" fw={700} c={semantic.textBrand} ff="monospace">
                {orderNumber}
              </Text>
            </Group>
            <Text size="sm" c={semantic.textSecondary} maw={460}>
              {paymentMethod === "COD"
                ? `Please keep ${formatBDT(total)} ready — you'll pay in cash when your order arrives.`
                : `Order total: ${formatBDT(total)}.`}{" "}
              You can follow its progress from My Orders at any time.
            </Text>
          </Stack>
        </motion.div>
      </Stack>
    </Paper>
  );
}
