import { brand, colors, semantic, tints, type ColorScaleName } from "./colors";
import { gradients } from "./gradients";
import { shadows } from "./shadows";
import { radius, zIndex } from "./shapes";
import { fontFamilies } from "./typography";
import { durations, cssEasing } from "./motion";
import { layout } from "./spacing";

/**
 * Converts a camelCase token key to kebab-case (`textMuted` → `text-muted`).
 */
function kebab(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Every design token as a CSS custom property, generated from the TS tokens
 * (single source of truth). Emitted on `:root` by Mantine's
 * `cssVariablesResolver` (see `theme.ts`), so plain CSS / CSS modules can use
 * e.g. `var(--mo-color-primary-6)`, `var(--mo-color-text-muted)`,
 * `var(--mo-shadow-card)`, `var(--mo-gradient-primary)`.
 *
 * Never hand-write these variables in CSS files — change the TS token instead.
 */
export function buildCssVariables(): Record<string, string> {
  const vars: Record<string, string> = {};

  (Object.keys(colors) as ColorScaleName[]).forEach((scale) => {
    colors[scale].forEach((value, index) => {
      vars[`--mo-color-${kebab(scale)}-${index}`] = value;
    });
  });

  Object.entries(brand).forEach(([key, value]) => {
    vars[`--mo-brand-${kebab(key)}`] = value;
  });

  Object.entries(tints).forEach(([key, value]) => {
    vars[`--mo-tint-${kebab(key)}`] = value;
  });

  Object.entries(semantic).forEach(([key, value]) => {
    vars[`--mo-color-${kebab(key)}`] = value;
  });

  Object.entries(gradients).forEach(([key, value]) => {
    vars[`--mo-gradient-${kebab(key)}`] = value;
  });

  Object.entries(shadows).forEach(([key, value]) => {
    vars[`--mo-shadow-${kebab(key)}`] = value;
  });

  Object.entries(radius).forEach(([key, value]) => {
    vars[`--mo-radius-${key}`] = value;
  });

  Object.entries(zIndex).forEach(([key, value]) => {
    vars[`--mo-z-${kebab(key)}`] = String(value);
  });

  Object.entries(fontFamilies).forEach(([key, value]) => {
    vars[`--mo-font-${kebab(key)}`] = value;
  });

  Object.entries(durations).forEach(([key, value]) => {
    vars[`--mo-duration-${kebab(key)}`] = `${value}ms`;
  });

  vars["--mo-ease-out"] = cssEasing("out");
  vars["--mo-ease-in"] = cssEasing("in");
  vars["--mo-ease-in-out"] = cssEasing("inOut");

  Object.entries(layout).forEach(([key, value]) => {
    vars[`--mo-layout-${kebab(key)}`] = value;
  });

  return vars;
}

/** Pre-computed map (tokens are static). */
export const cssVariables: Readonly<Record<string, string>> = buildCssVariables();
