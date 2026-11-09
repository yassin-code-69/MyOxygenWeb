"use client";

import { ActionIcon, Group, Text, VisuallyHidden } from "@mantine/core";
import { IconMinus, IconPlus } from "@tabler/icons-react";
import { semantic } from "../../tokens";

export interface QuantityStepperProps {
  value: number;
  /** Highest allowed quantity (available stock). */
  max: number;
  min?: number;
  onChange: (next: number) => void;
  /** Product name, used in the button labels ("Increase quantity of …"). */
  itemLabel: string;
  disabled?: boolean;
  size?: "sm" | "md";
}

/** Pill-shaped − / value / + control with accessible labels and live value. */
export function QuantityStepper({
  value,
  max,
  min = 1,
  onChange,
  itemLabel,
  disabled = false,
  size = "sm",
}: QuantityStepperProps) {
  const iconSize = size === "sm" ? 14 : 16;
  const buttonSize = size === "sm" ? 28 : 34;
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  return (
    <Group
      role="group"
      aria-label={`Quantity of ${itemLabel}`}
      gap={4}
      wrap="nowrap"
      p={3}
      style={{
        borderRadius: "var(--mantine-radius-xl)",
        border: `1px solid ${semantic.borderBrand}`,
        backgroundColor: semantic.surfaceBrandTint,
        width: "fit-content",
      }}
    >
      <ActionIcon
        variant="subtle"
        color="primaryPink"
        size={buttonSize}
        radius="xl"
        onClick={() => onChange(value - 1)}
        disabled={!canDecrease}
        aria-label={`Decrease quantity of ${itemLabel}`}
      >
        <IconMinus size={iconSize} aria-hidden />
      </ActionIcon>
      <Text
        component="output"
        aria-live="polite"
        aria-atomic="true"
        fw={700}
        size={size}
        c={semantic.text}
        ta="center"
        miw={24}
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        <VisuallyHidden>Quantity </VisuallyHidden>
        {value}
      </Text>
      <ActionIcon
        variant="subtle"
        color="primaryPink"
        size={buttonSize}
        radius="xl"
        onClick={() => onChange(value + 1)}
        disabled={!canIncrease}
        aria-label={`Increase quantity of ${itemLabel}`}
      >
        <IconPlus size={iconSize} aria-hidden />
      </ActionIcon>
    </Group>
  );
}
