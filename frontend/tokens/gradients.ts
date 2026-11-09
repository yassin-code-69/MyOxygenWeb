import { brand, colors, tints, withAlpha } from "./colors";

/**
 * Brand gradients. Every stop references a color token — never write hex here.
 */
export const gradients = {
  /** Primary CTA: `#FF6B8B → #F472B6` (RULES). */
  primary: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.primaryGradientEnd} 100%)`,
  /** Hover state of the primary CTA (one shade deeper). */
  primaryHover: `linear-gradient(135deg, ${colors.primary[7]} 0%, ${brand.primary} 100%)`,
  /** Secondary: `#4CAF7D → #A78BFA` (RULES). */
  secondary: `linear-gradient(135deg, ${brand.secondary} 0%, ${brand.accent} 100%)`,
  /** Soft pink (admin logo chip, decorative). */
  primarySoft: `linear-gradient(135deg, ${brand.primary} 0%, ${colors.primary[3]} 100%)`,
  /** Brand duo pink → green (admin brand mark). */
  brandMix: `linear-gradient(135deg, ${brand.primary} 0%, ${brand.secondary} 100%)`,
  /** Page-progress bar sweep: pink → orchid → purple. */
  progress: `linear-gradient(90deg, ${brand.primary} 0%, ${brand.primaryGradientEnd} 50%, ${brand.accent} 100%)`,
  /** Mobile storefront top bar peach (`#FFF1ED → #FFE3DA`, SPECIFICATION §4). */
  peach: `linear-gradient(180deg, ${tints.peachLight} 0%, ${tints.peach} 100%)`,
  /** Peach that dissolves into the cream canvas (mobile header with content below). */
  peachToCanvas: `linear-gradient(180deg, ${tints.peach} 0%, ${tints.peachLight} 70%, ${brand.cream} 100%)`,
  /** Hero / banner blush wash. */
  blushHero: `linear-gradient(105deg, ${tints.blushLight} 0%, ${tints.blush} 45%, ${brand.cream} 100%)`,
  /** Promotional banner tint. */
  blushBanner: `linear-gradient(135deg, ${colors.primary[0]} 0%, ${colors.primary[1]} 100%)`,
  /** Card surface fading into cream. */
  creamSurface: `linear-gradient(180deg, ${brand.white} 0%, ${brand.cream} 100%)`,
  /** Dark badge (reward tier, admin chips). */
  dark: `linear-gradient(135deg, ${colors.neutral[8]} 0%, ${colors.neutral[7]} 100%)`,
  /** Amber reward-points badge. */
  warning: `linear-gradient(90deg, ${colors.warning[6]} 0%, ${colors.warning[7]} 100%)`,
  /** Success tint for KPI tiles. */
  successTint: `linear-gradient(135deg, ${withAlpha(brand.secondary, 0.15)} 0%, ${withAlpha(brand.secondary, 0.25)} 100%)`,
  /** Info tint for KPI tiles. */
  infoTint: `linear-gradient(135deg, ${withAlpha(colors.info[6], 0.12)} 0%, ${withAlpha(colors.info[6], 0.22)} 100%)`,
  /** Skeleton shimmer sweep (transparent → highlight → transparent). */
  shimmer: `linear-gradient(90deg, ${withAlpha(tints.shimmerHighlight, 0)} 0%, ${tints.shimmerHighlight} 50%, ${withAlpha(tints.shimmerHighlight, 0)} 100%)`,
} as const;

export type GradientName = keyof typeof gradients;

/**
 * Mantine `gradient` prop objects (for `variant="gradient"` on Button / Badge / ThemeIcon).
 */
export const mantineGradients = {
  primary: { from: brand.primary, to: brand.primaryGradientEnd, deg: 135 },
  secondary: { from: brand.secondary, to: brand.accent, deg: 135 },
  warning: { from: colors.warning[6], to: colors.warning[7], deg: 90 },
} as const;

/**
 * @deprecated Use `gradients`. Kept for backwards compatibility.
 */
export const brandGradients = {
  primary: gradients.primary,
  secondary: gradients.secondary,
  darkBadge: gradients.dark,
  creamSurface: gradients.creamSurface,
} as const;
