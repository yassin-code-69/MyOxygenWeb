/**
 * Mantine module augmentation — gives `color`, `shadow` props autocomplete for
 * the My Oxygen palette and named shadows registered in `theme.ts`.
 */
import type { DefaultMantineColor, MantineColorsTuple } from "@mantine/core";

type MyOxygenColor =
  | "primaryPink"
  | "secondaryGreen"
  | "accentPurple"
  | "success"
  | "warning"
  | "danger"
  | "info";

type MyOxygenShadow =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "none"
  | "card"
  | "cardHover"
  | "button"
  | "buttonSecondary"
  | "buttonAccent"
  | "badge"
  | "dropdown"
  | "modal"
  | "navbar"
  | "bottomNav"
  | "notification"
  | "focus"
  | "glow";

declare module "@mantine/core" {
  export interface MantineThemeColorsOverride {
    colors: Record<MyOxygenColor | DefaultMantineColor, MantineColorsTuple>;
  }

  export interface MantineThemeSizesOverride {
    shadows: Record<MyOxygenShadow, string>;
  }
}
