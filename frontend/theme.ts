"use client";

/**
 * My Oxygen — Mantine 9 theme (single source of truth for component styling).
 *
 * - Colors come from `tokens/colors.ts`; brand anchors sit at index 6, and
 *   `primaryShade = 6`, so `filled` components render exactly #FF6B8B / #4CAF7D / #A78BFA.
 * - Radius: `md` = 16px (cards, modals, inputs), `xl` = pill (buttons, badges, tags).
 * - Fonts resolve to the next/font CSS variables set on <html> in `app/layout.tsx`.
 * - All `--mo-*` CSS variables are generated from tokens by `cssVariablesResolver`.
 * - Behavioural CSS that Mantine props cannot express (button lift, warm skeleton
 *   shimmer, input borders, focus ring) lives in `app/globals.css` and targets
 *   Mantine static classes.
 */
import {
  ActionIcon,
  Anchor,
  Badge,
  Button,
  Card,
  Checkbox,
  Drawer,
  Loader,
  Menu,
  Modal,
  Notification,
  Pagination,
  Paper,
  Popover,
  Skeleton,
  Switch,
  Tabs,
  Tooltip,
  createTheme,
  defaultVariantColorsResolver,
  parseThemeColor,
  rem,
  type ChipProps,
  type CSSVariablesResolver,
  type IndicatorProps,
  type MantineColorsTuple,
  type ProgressProps,
  type RadioProps,
  type RatingProps,
  type SegmentedControlProps,
  type StepperProps,
  type VariantColorsResolver,
} from "@mantine/core";
import {
  brand,
  colors,
  cssVariables,
  fontFamilies,
  radius,
  semantic,
  shadows,
  spacing,
} from "./tokens";

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const primaryPink: MantineColorsTuple = colors.primary;
const secondaryGreen: MantineColorsTuple = colors.secondary;
const accentPurple: MantineColorsTuple = colors.accent;
const success: MantineColorsTuple = colors.success;
const warning: MantineColorsTuple = colors.warning;
const danger: MantineColorsTuple = colors.danger;
const info: MantineColorsTuple = colors.info;
const neutral: MantineColorsTuple = colors.neutral;

// ---------------------------------------------------------------------------
// Accessibility: AA text for tinted / outline variants
// ---------------------------------------------------------------------------

/**
 * Mantine renders `outline` / `white` variant text with the filled shade (index 6),
 * which is 2.7:1 on white for every brand color. Swap the text to shade 8
 * (>= 4.5:1) while keeping the brand-colored border/background.
 */
const variantColorResolver: VariantColorsResolver = (input) => {
  const defaults = defaultVariantColorsResolver(input);
  const parsed = parseThemeColor({
    color: input.color || input.theme.primaryColor,
    theme: input.theme,
  });

  if (!parsed.isThemeColor || parsed.shade !== undefined) {
    return defaults;
  }

  if (input.variant === "outline" || input.variant === "white") {
    return { ...defaults, color: `var(--mantine-color-${parsed.color}-8)` };
  }

  return defaults;
};

// ---------------------------------------------------------------------------
// CSS variables
// ---------------------------------------------------------------------------

const semanticOverrides: Record<string, string> = {
  "--mantine-color-dimmed": semantic.textMuted,
  "--mantine-color-placeholder": semantic.textMuted,
  "--mantine-color-anchor": semantic.link,
  "--mantine-color-default-border": semantic.borderStrong,
  "--mantine-color-disabled-color": semantic.textSubtle,
  // #EF4444 is 3.76:1 on white — error *text* needs the AA shade.
  "--mantine-color-error": colors.danger[7],
  "--mantine-color-success": colors.success[8],
};

const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: { ...cssVariables },
  light: semanticOverrides,
  // Color scheme is forced to light; mirror the overrides defensively.
  dark: semanticOverrides,
});

// ---------------------------------------------------------------------------
// Typed default-prop configs for components we do not import at runtime
// (keeps rarely used components out of the shared bundle).
// ---------------------------------------------------------------------------

interface ComponentDefaults<P> {
  defaultProps?: Partial<P>;
}

const stepperDefaults: ComponentDefaults<StepperProps> = {
  defaultProps: { color: "primaryPink", radius: "xl", iconSize: 36 },
};
const segmentedControlDefaults: ComponentDefaults<SegmentedControlProps> = {
  defaultProps: { radius: "xl", color: "primaryPink" },
};
const chipDefaults: ComponentDefaults<ChipProps> = {
  defaultProps: { radius: "xl", color: "primaryPink", variant: "light" },
};
const radioDefaults: ComponentDefaults<RadioProps> = {
  defaultProps: { color: "primaryPink" },
};
const ratingDefaults: ComponentDefaults<RatingProps> = {
  defaultProps: { color: "warning" },
};
const progressDefaults: ComponentDefaults<ProgressProps> = {
  defaultProps: { color: "primaryPink", radius: "xl" },
};
const indicatorDefaults: ComponentDefaults<IndicatorProps> = {
  defaultProps: { color: "primaryPink" },
};

const overlayProps = {
  color: semantic.overlay,
  backgroundOpacity: 0.45,
  blur: 2,
} as const;

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

export const theme = createTheme({
  white: brand.white,
  black: semantic.text,

  colors: {
    primaryPink,
    secondaryGreen,
    accentPurple,
    success,
    warning,
    danger,
    info,
    // Re-map Mantine's built-in names onto the brand palette so legacy
    // `color="pink" | "red" | "teal" | "green" | "gray" ...` stay on-brand.
    pink: primaryPink,
    red: danger,
    green: success,
    teal: success,
    yellow: warning,
    blue: info,
    violet: accentPurple,
    gray: neutral,
  },
  primaryColor: "primaryPink",
  primaryShade: { light: 6, dark: 6 },
  variantColorResolver,
  autoContrast: false,
  defaultGradient: { from: brand.primary, to: brand.primaryGradientEnd, deg: 135 },

  fontFamily: fontFamilies.body,
  fontFamilyMonospace: fontFamilies.monospace,
  headings: {
    fontFamily: fontFamilies.heading,
    fontWeight: "700",
    textWrap: "balance",
    sizes: {
      h1: { fontSize: rem(34), lineHeight: "1.25", fontWeight: "700" },
      h2: { fontSize: rem(26), lineHeight: "1.3", fontWeight: "700" },
      h3: { fontSize: rem(22), lineHeight: "1.35", fontWeight: "600" },
      h4: { fontSize: rem(18), lineHeight: "1.4", fontWeight: "600" },
      h5: { fontSize: rem(16), lineHeight: "1.5", fontWeight: "600" },
      h6: { fontSize: rem(14), lineHeight: "1.5", fontWeight: "600" },
    },
  },

  radius: { ...radius },
  defaultRadius: "md",
  spacing: { ...spacing },
  shadows: { ...shadows },

  cursorType: "pointer",
  respectReducedMotion: true,
  focusClassName: "mo-focus-ring",

  components: {
    Button: Button.extend({
      defaultProps: { radius: "xl", fw: 600 },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: { radius: "xl" },
    }),
    Badge: Badge.extend({
      defaultProps: { radius: "xl" },
    }),
    Anchor: Anchor.extend({
      defaultProps: { underline: "hover" },
    }),

    Card: Card.extend({
      defaultProps: { radius: "md", shadow: "card", padding: "md" },
      styles: { root: { "--paper-border-color": semantic.borderBrand } },
    }),
    Paper: Paper.extend({
      defaultProps: { radius: "md" },
      styles: { root: { "--paper-border-color": semantic.borderBrand } },
    }),
    Modal: Modal.extend({
      defaultProps: { radius: "md", shadow: "modal", overlayProps },
    }),
    Drawer: Drawer.extend({
      defaultProps: { radius: "md", shadow: "modal", overlayProps },
    }),
    Popover: Popover.extend({
      defaultProps: { radius: "md", shadow: "dropdown" },
    }),
    Menu: Menu.extend({
      defaultProps: { radius: "md", shadow: "dropdown" },
    }),
    Tooltip: Tooltip.extend({
      defaultProps: { radius: "sm", withArrow: true, arrowSize: 6, openDelay: 150 },
    }),
    Notification: Notification.extend({
      defaultProps: { radius: "md", color: "primaryPink" },
      styles: { root: { boxShadow: shadows.notification } },
    }),

    Skeleton: Skeleton.extend({
      defaultProps: { radius: "md" },
    }),
    Loader: Loader.extend({
      defaultProps: { color: "primaryPink" },
    }),

    Pagination: Pagination.extend({
      defaultProps: { radius: "xl", color: "primaryPink" },
    }),
    Tabs: Tabs.extend({
      defaultProps: { color: "primaryPink", radius: "md" },
    }),
    Checkbox: Checkbox.extend({
      defaultProps: { color: "primaryPink", radius: "sm" },
    }),
    Switch: Switch.extend({
      defaultProps: { color: "secondaryGreen" },
    }),

    Stepper: stepperDefaults,
    SegmentedControl: segmentedControlDefaults,
    Chip: chipDefaults,
    Radio: radioDefaults,
    Rating: ratingDefaults,
    Progress: progressDefaults,
    Indicator: indicatorDefaults,
  },
});

export { cssVariablesResolver };
