import { Group, Text, VisuallyHidden, type MantineSize, type TextProps } from "@mantine/core";
import { formatBDT, toNumber } from "../lib/format";
import { semantic } from "../tokens";

export type PriceTone = "default" | "brand" | "muted";

export interface PriceProps extends Omit<TextProps, "children" | "c" | "size"> {
  /** Amount in BDT (API decimal strings accepted). */
  value: number | string | null | undefined;
  /**
   * Original price. When greater than `value`, it is shown struck-through after
   * the current price and announced as "Original price" to screen readers.
   */
  compareAt?: number | string | null;
  /** `"strike"` renders the value itself struck-through (e.g. inside a summary). */
  variant?: "default" | "strike";
  /** Text color role. `brand` uses the AA pink (`semantic.textBrand`). */
  tone?: PriceTone;
  size?: MantineSize;
  /** Force 2-decimal paisa display. Defaults to auto (only when non-integer). */
  decimals?: boolean | "auto";
}

const toneColor: Record<PriceTone, string> = {
  default: semantic.text,
  brand: semantic.textBrand,
  muted: semantic.textMuted,
};

const compareSize: Record<MantineSize, MantineSize> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
  lg: "sm",
  xl: "md",
};

/**
 * Bangladeshi Taka price with lakh grouping (`৳1,25,000`) and tabular numerals.
 *
 * ```tsx
 * <Price value={product.effectivePrice} compareAt={product.basePrice} tone="brand" size="lg" />
 * ```
 */
export function Price({
  value,
  compareAt,
  variant = "default",
  tone = "default",
  size = "md",
  decimals = "auto",
  fw = 700,
  style,
  ...others
}: PriceProps) {
  const amount = toNumber(value);
  const original = compareAt === null || compareAt === undefined ? null : toNumber(compareAt);
  const showCompare = variant === "default" && original !== null && original > amount;
  const isStrike = variant === "strike";

  const main = (
    <Text
      component="span"
      size={size}
      fw={isStrike ? 500 : fw}
      c={isStrike ? semantic.textMuted : toneColor[tone]}
      td={isStrike ? "line-through" : undefined}
      style={[{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }, style]}
      {...others}
    >
      {isStrike ? <VisuallyHidden>Original price: </VisuallyHidden> : null}
      {formatBDT(amount, { decimals })}
    </Text>
  );

  if (!showCompare) {
    return main;
  }

  return (
    <Group component="span" gap={6} align="baseline" wrap="nowrap" display="inline-flex">
      {main}
      <Text
        component="span"
        size={compareSize[size]}
        fw={500}
        c={semantic.textMuted}
        td="line-through"
        style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}
      >
        <VisuallyHidden>Original price: </VisuallyHidden>
        {formatBDT(original, { decimals })}
      </Text>
    </Group>
  );
}
