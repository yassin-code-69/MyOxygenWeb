import { brand, colors, withAlpha } from "./colors";

const ink = colors.neutral[8];
const pink = brand.primary;

/**
 * Soft brand shadows. Components must use these (or Mantine `shadow="card"` etc.)
 * instead of ad-hoc `rgba()` box-shadows.
 *
 * The `xs`–`xl` keys are registered as Mantine `theme.shadows`, as are the named
 * keys, so `<Paper shadow="card" />` resolves to `var(--mantine-shadow-card)`.
 */
export const shadows = {
  none: "none",
  xs: `0 1px 2px ${withAlpha(ink, 0.04)}`,
  sm: `0 1px 3px ${withAlpha(ink, 0.06)}, 0 1px 2px ${withAlpha(ink, 0.04)}`,
  md: `0 4px 16px ${withAlpha(pink, 0.08)}`,
  lg: `0 10px 28px ${withAlpha(pink, 0.14)}`,
  xl: `0 18px 45px ${withAlpha(pink, 0.16)}`,

  /** Resting product / content card. */
  card: `0 4px 16px ${withAlpha(pink, 0.06)}`,
  /** Hovered product / content card. */
  cardHover: `0 10px 28px ${withAlpha(pink, 0.14)}`,
  /** Primary (pink) CTA. */
  button: `0 4px 14px ${withAlpha(pink, 0.3)}`,
  /** Secondary (green → purple) CTA. */
  buttonSecondary: `0 4px 14px ${withAlpha(brand.secondary, 0.25)}`,
  /** Accent (purple) CTA. */
  buttonAccent: `0 4px 14px ${withAlpha(brand.accent, 0.3)}`,
  /** Discount / count badges sitting on imagery. */
  badge: `0 2px 6px ${withAlpha(pink, 0.35)}`,
  /** Menus, selects, popovers. */
  dropdown: `0 8px 24px ${withAlpha(pink, 0.1)}, 0 2px 6px ${withAlpha(ink, 0.05)}`,
  /** Modals & drawers. */
  modal: `0 24px 60px ${withAlpha(ink, 0.16)}, 0 8px 24px ${withAlpha(pink, 0.1)}`,
  /** Sticky top navigation. */
  navbar: `0 4px 20px ${withAlpha(pink, 0.08)}`,
  /** Sticky bottom navigation (shadow cast upwards). */
  bottomNav: `0 -4px 20px ${withAlpha(pink, 0.08)}`,
  /** Toast notifications. */
  notification: `0 10px 30px ${withAlpha(ink, 0.12)}`,
  /** Keyboard focus halo for inputs (pairs with the green focus border). */
  focus: `0 0 0 3px ${withAlpha(colors.secondary[7], 0.25)}`,
  /** Brand glow (page-progress bar). */
  glow: `0 0 10px ${withAlpha(pink, 0.7)}, 0 0 4px ${withAlpha(pink, 0.4)}`,
} as const;

export type ShadowName = keyof typeof shadows;
