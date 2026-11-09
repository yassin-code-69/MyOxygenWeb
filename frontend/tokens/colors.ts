/**
 * My Oxygen Design System v1.0 — color tokens.
 *
 * THIS FILE IS THE ONLY PLACE IN THE FRONTEND WHERE HEX VALUES MAY BE WRITTEN.
 * Components consume colors through:
 *   - Mantine props (`color="primaryPink"`, `c="dimmed"`, `bg="primaryPink.0"`), or
 *   - the typed helpers exported here (`colors.primary[6]`, `semantic.textMuted`), or
 *   - CSS custom properties (`var(--mo-color-text-muted)`) emitted from `tokens/css-variables.ts`.
 *
 * Scale convention (all 10-step scales):
 *   index 0-2  tinted backgrounds / borders
 *   index 6    BRAND ANCHOR — the exact brand hex, rendered by Mantine `filled` variants
 *              (theme.primaryShade = 6)
 *   index 7    hover / pressed shade for filled surfaces
 *   index 8    AA-compliant text on white, cream and tinted surfaces (>= 4.5:1)
 *   index 9    high-contrast text on index-1 tints (Mantine `light` variant text)
 */

export type ColorScale = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/** Index into a 10-step scale. */
export type ColorShade = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

// ---------------------------------------------------------------------------
// Brand scales
// ---------------------------------------------------------------------------

/** Primary pink — anchor `#FF6B8B` at index 6. */
const primary: ColorScale = [
  "#FFF0F3", // 0 blush tint — pill/badge backgrounds, hover fills
  "#FFE4EC", // 1 warm border, light-variant background
  "#FFC7D2", // 2 input border, scrollbar thumb
  "#FFA8BA", // 3 decorative strokes
  "#FF8FA4", // 4 hover border
  "#FF7D97", // 5 soft fill
  "#FF6B8B", // 6 BRAND PRIMARY — filled buttons, active badges
  "#E9557A", // 7 hover / pressed (replaces off-palette #FF4D6D, #E63956, #E11D48)
  "#C9325C", // 8 AA text: 5.13:1 on white, 4.89:1 on cream, 4.64:1 on blush
  "#8F1D3C", // 9 high-contrast text on tints (7.29:1 on index 1)
];

/** Secondary green — anchor `#4CAF7D` at index 6. */
const secondary: ColorScale = [
  "#EDFBF3",
  "#D6F3E3",
  "#B2E6CA",
  "#8DD8B0",
  "#6FCB99",
  "#5CBD8A",
  "#4CAF7D", // 6 BRAND SECONDARY — trust badges, icons
  "#3E9A6A", // 7 hover; focus ring (3.48:1 on white — WCAG 1.4.11 non-text)
  "#2C7A52", // 8 AA text: 5.23:1 on white
  "#205B3D", // 9 high-contrast text on tints
];

/** Accent purple — anchor `#A78BFA` at index 6. */
const accent: ColorScale = [
  "#F5F3FF",
  "#EDE9FE",
  "#DDD6FE",
  "#C4B5FD",
  "#B9A5FC",
  "#B098FB",
  "#A78BFA", // 6 BRAND ACCENT — category accents, promo tags
  "#8B5CF6", // 7 hover
  "#7C3AED", // 8 AA text: 5.70:1 on white
  "#6D28D9", // 9 high-contrast text on tints
];

/** Neutral (cool gray). Anchors: 8 = Dark Text `#1F2937`, 5 = Text Gray `#6B7280`. */
const neutral: ColorScale = [
  "#F9FAFB", // 0 muted surface
  "#F3F4F6", // 1 subtle border / zebra rows
  "#E5E7EB", // 2 default border
  "#D1D5DB", // 3 strong border
  "#9CA3AF", // 4 decorative icons, disabled text (NOT for readable text: 2.54:1)
  "#6B7280", // 5 TEXT GRAY — body copy, placeholders, muted labels (4.83:1 on white)
  "#4B5563", // 6 secondary text; muted text on tinted surfaces
  "#374151", // 7 strong text
  "#1F2937", // 8 DARK TEXT — headings, primary text (14.68:1 on white)
  "#111827", // 9 tooltips / near-black
];

// ---------------------------------------------------------------------------
// Feedback scales (anchor at index 6 so `filled` renders the RULES value)
// ---------------------------------------------------------------------------

/** Success — anchor `#10B981`. */
const success: ColorScale = [
  "#ECFDF5",
  "#D1FAE5",
  "#A7F3D0",
  "#6EE7B7",
  "#34D399",
  "#22C68D",
  "#10B981", // 6 RULES success
  "#059669",
  "#047857", // 8 AA text
  "#065F46",
];

/** Warning — anchor `#F59E0B`. */
const warning: ColorScale = [
  "#FFFBEB",
  "#FEF3C7",
  "#FDE68A",
  "#FCD34D",
  "#FBBF24",
  "#F8AE18",
  "#F59E0B", // 6 RULES warning
  "#D97706",
  "#B45309", // 8 AA text
  "#92400E",
];

/** Danger / error — anchor `#EF4444`. */
const danger: ColorScale = [
  "#FEF2F2",
  "#FEE2E2",
  "#FECACA",
  "#FCA5A5",
  "#F87171",
  "#F45B5B",
  "#EF4444", // 6 RULES error
  "#DC2626",
  "#B91C1C", // 8 AA text
  "#991B1B",
];

/** Info — used for "processing" / informational states. Anchor `#3B82F6`. */
const info: ColorScale = [
  "#EFF6FF",
  "#DBEAFE",
  "#BFDBFE",
  "#93C5FD",
  "#60A5FA",
  "#4E94F8",
  "#3B82F6",
  "#2563EB",
  "#1D4ED8", // 8 AA text
  "#1E40AF",
];

/** All scales, keyed by role. `colors.primary[6] === "#FF6B8B"`. */
export const colors = {
  primary,
  secondary,
  accent,
  neutral,
  success,
  warning,
  danger,
  info,
} as const;

export type ColorScaleName = keyof typeof colors;

// ---------------------------------------------------------------------------
// The 10 core brand values from context/RULES.md (+ gradient stop)
// ---------------------------------------------------------------------------

export const brand = {
  primary: primary[6],
  /** End stop of the primary gradient (`#FF6B8B → #F472B6`). */
  primaryGradientEnd: "#F472B6",
  secondary: secondary[6],
  accent: accent[6],
  cream: "#FFF8F6",
  white: "#FFFFFF",
  darkText: neutral[8],
  textGray: neutral[5],
  success: success[6],
  warning: warning[6],
  error: danger[6],
} as const;

// ---------------------------------------------------------------------------
// Supporting tints (non-scale surface colors the current UI genuinely needs)
// ---------------------------------------------------------------------------

export const tints = {
  /** Mobile header peach gradient — top stop. */
  peachLight: "#FFF1ED",
  /** Mobile header peach gradient — bottom stop. */
  peach: "#FFE3DA",
  /** Hero / banner blush wash (very light). */
  blushLight: "#FFF7F9",
  /** Hero / banner blush wash. */
  blush: "#FFEBF1",
  /** Skeleton shimmer base (warm rose). */
  shimmerBase: "#FDE8EC",
  /** Skeleton shimmer highlight (warm cream). */
  shimmerHighlight: "#FFF5F8",
} as const;

// ---------------------------------------------------------------------------
// Semantic aliases — prefer these in components
// ---------------------------------------------------------------------------

export const semantic = {
  // Canvas & surfaces
  canvas: brand.cream,
  surface: brand.white,
  surfaceMuted: neutral[0],
  surfaceSubtle: neutral[1],
  surfaceBrandTint: primary[0],
  surfaceBrandSoft: primary[1],
  surfaceSuccessTint: secondary[0],
  surfaceAccentTint: accent[0],
  surfaceDangerTint: danger[1],
  surfaceWarningTint: warning[1],
  surfaceInfoTint: info[1],
  surfacePeach: tints.peachLight,

  // Text
  text: neutral[8],
  textStrong: neutral[7],
  textSecondary: neutral[6],
  textMuted: neutral[5],
  /** On tinted (blush/peach) backgrounds `textMuted` drops below 4.5:1 — use this instead. */
  textMutedOnTint: neutral[6],
  /** Decorative only (icons, disabled). Fails AA for readable text. */
  textSubtle: neutral[4],
  textOnPrimary: brand.white,
  textOnDark: brand.white,
  textBrand: primary[8],
  textBrandStrong: primary[9],
  textSuccess: secondary[8],
  textAccent: accent[8],
  textDanger: danger[8],
  textWarning: warning[9],
  textInfo: info[8],

  // Borders
  border: neutral[2],
  borderSubtle: neutral[1],
  borderStrong: neutral[3],
  borderBrand: primary[1],
  borderBrandStrong: primary[4],
  borderInput: primary[2],

  // Interaction
  focusRing: secondary[7],
  selectionBg: primary[1],
  selectionText: primary[9],
  link: primary[8],
  linkHover: primary[9],

  // Icons
  icon: neutral[5],
  iconMuted: neutral[4],
  iconBrand: primary[6],
  iconSuccess: secondary[6],

  // Rating stars (only render when real rating data exists)
  rating: warning[6],

  // Loading
  skeletonBase: tints.shimmerBase,
  skeletonHighlight: tints.shimmerHighlight,

  // Scrollbar
  scrollbarTrack: brand.cream,
  scrollbarThumb: primary[2],
  scrollbarThumbHover: primary[6],

  // Overlays
  overlay: neutral[8],
} as const;

export type SemanticColor = keyof typeof semantic;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a 6-digit hex token to an `rgba()` string. Use this instead of writing
 * ad-hoc rgba literals: `withAlpha(colors.primary[6], 0.35)`.
 */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) {
    throw new Error(`withAlpha expects a 6-digit hex color, received "${hex}"`);
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// ---------------------------------------------------------------------------
// Legacy API (kept so existing pages compile; stage 3 migrates away)
// ---------------------------------------------------------------------------

/**
 * @deprecated Use `brand`, `semantic` or `colors` instead. Kept for backwards
 * compatibility with pages written before the token refactor.
 */
export const myOxygenColors = {
  primaryPink: brand.primary,
  primaryPinkHover: brand.primaryGradientEnd,
  primaryPinkActive: primary[7],
  secondaryGreen: brand.secondary,
  accentPurple: brand.accent,
  creamBackground: brand.cream,
  surfaceWhite: brand.white,
  darkText: brand.darkText,
  textGray: brand.textGray,
  success: brand.success,
  warning: brand.warning,
  error: brand.error,
} as const;

/** @deprecated Use `SemanticColor` / `ColorScaleName`. */
export type MyOxygenColorKey = keyof typeof myOxygenColors;
