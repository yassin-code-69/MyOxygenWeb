/**
 * Shape language.
 *
 * Mantine radius keys are remapped so that:
 *   - `radius="md"` = 16px  → product cards, modals, drawers, inputs (RULES §3)
 *   - `radius="xl"` = pill  → buttons, search bars, tags, badges (RULES §3)
 */
export const radius = {
  xs: "4px",
  sm: "8px",
  md: "16px",
  lg: "24px",
  xl: "9999px",
} as const;

export type RadiusName = keyof typeof radius;

/** Fixed aspect ratios used by imagery. */
export const aspectRatios = {
  product: "1 / 1",
  banner: "16 / 6",
  category: "4 / 3",
} as const;

/** Stacking order (Mantine uses 100–400 for app/modal/popover/overlay). */
export const zIndex = {
  sticky: 90,
  header: 100,
  bottomNav: 150,
  drawer: 200,
  toast: 1000,
  progress: 1100,
} as const;

/**
 * @deprecated Use `radius` (and Mantine `radius="md" | "xl"`).
 */
export const shapes = {
  radiusPill: radius.xl,
  radiusCard: radius.md,
  radiusModal: radius.md,
  radiusInput: radius.md,
  radiusInnerTray: "12px",
  radiusBadge: radius.xl,
} as const;
