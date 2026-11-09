import { Box, type MantineColor } from "@mantine/core";
import { cssColor } from "./kit/tones";

export interface MeterBarProps {
  /** 0–1 share of the track. */
  ratio: number;
  /** Theme color name (`secondaryGreen`, shade 6) or name with shade (`info.5`). */
  color?: MantineColor;
  height?: number;
}

/**
 * Horizontal proportion bar. The fill is scaled with `transform: scaleX`
 * (compositor-only) — never by animating `width`.
 */
export function MeterBar({ ratio, color = "primaryPink", height = 8 }: MeterBarProps) {
  const clamped = Number.isFinite(ratio) ? Math.min(1, Math.max(0, ratio)) : 0;
  return (
    <Box
      aria-hidden
      h={height}
      style={{
        borderRadius: "var(--mo-radius-xl)",
        backgroundColor: "var(--mo-color-surface-subtle)",
        overflow: "hidden",
      }}
    >
      <Box
        h="100%"
        bg={cssColor(color)}
        style={{
          borderRadius: "var(--mo-radius-xl)",
          transform: `scaleX(${clamped})`,
          transformOrigin: "left center",
          transition: "transform var(--mo-duration-moderate) var(--mo-ease-out)",
        }}
      />
    </Box>
  );
}
