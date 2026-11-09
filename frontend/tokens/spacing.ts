/**
 * Spacing scale — identical to Mantine's defaults so `p="md"`, `gap="lg"` etc.
 * keep their current meaning. Exposed for plain-CSS / style objects.
 */
export const spacing = {
  xs: "10px",
  sm: "12px",
  md: "16px",
  lg: "20px",
  xl: "32px",
} as const;

export type SpacingName = keyof typeof spacing;

/** Layout constants shared by storefront chrome. */
export const layout = {
  /** Max content width for storefront containers. */
  containerMaxWidth: "1280px",
  /** Height reserved for the fixed mobile bottom navigation. */
  mobileBottomNavHeight: "72px",
  /** Height of the progress bar on route transitions. */
  progressBarHeight: "3px",
} as const;
