"use client";

import { Box, Group, Stack, Text } from "@mantine/core";
import { IconCircleCheck, IconTruckDelivery } from "@tabler/icons-react";
import { motion } from "motion/react";
import { amountToFreeDelivery, FREE_DELIVERY_THRESHOLD } from "../../lib/cart-store";
import { formatBDT } from "../../lib/format";
import { brand, gradients, semantic } from "../../tokens";
import { springs } from "../../tokens/motion";

export interface FreeDeliveryProgressProps {
  /** Cart subtotal at effective prices, before coupons (the backend's rule). */
  subtotal: number;
}

/**
 * "Add ৳X more for free delivery" with a progress bar. The fill animates with
 * `transform: scaleX` only (no width changes, no layout work).
 */
export function FreeDeliveryProgress({ subtotal }: FreeDeliveryProgressProps) {
  const remaining = amountToFreeDelivery(subtotal);
  const unlocked = remaining <= 0;
  const progress = Math.min(1, Math.max(0, subtotal / FREE_DELIVERY_THRESHOLD));

  return (
    <Stack gap={8}>
      <Group gap={8} wrap="nowrap" aria-live="polite">
        {unlocked ? (
          <IconCircleCheck size={18} color={brand.secondary} aria-hidden />
        ) : (
          <IconTruckDelivery size={18} color={brand.primary} aria-hidden />
        )}
        <Text size="sm" c={semantic.textSecondary}>
          {unlocked ? (
            <>
              <Text component="span" fw={700} c={semantic.textSuccess} inherit>
                Free delivery unlocked
              </Text>{" "}
              on this order.
            </>
          ) : (
            <>
              Add{" "}
              <Text component="span" fw={700} c={semantic.textBrand} inherit>
                {formatBDT(remaining)}
              </Text>{" "}
              more for free delivery.
            </>
          )}
        </Text>
      </Group>
      <Box
        role="progressbar"
        aria-label="Progress towards free delivery"
        aria-valuemin={0}
        aria-valuemax={FREE_DELIVERY_THRESHOLD}
        aria-valuenow={Math.min(subtotal, FREE_DELIVERY_THRESHOLD)}
        aria-valuetext={
          unlocked ? "Free delivery unlocked" : `${formatBDT(remaining)} more needed for free delivery`
        }
        h={8}
        style={{
          borderRadius: "var(--mantine-radius-xl)",
          backgroundColor: semantic.surfaceBrandSoft,
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={false}
          animate={{ scaleX: progress }}
          transition={springs.gentle}
          style={{
            height: "100%",
            width: "100%",
            transformOrigin: "left center",
            background: unlocked ? brand.secondary : gradients.primary,
          }}
        />
      </Box>
    </Stack>
  );
}
