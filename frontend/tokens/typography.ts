/**
 * Typography tokens.
 *
 * Font files are loaded once in `app/layout.tsx` via `next/font/google`, which
 * exposes them as CSS variables on <html>: `--font-poppins`, `--font-inter`,
 * `--font-caveat`. The stacks below reference those variables first so Mantine
 * (Title, Text, inputs) and plain CSS render the self-hosted fonts, with
 * sensible fallbacks while they load.
 */
const systemSans =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export const fontFamilies = {
  /** Headings — Poppins (RULES), Montserrat fallback. */
  heading: `var(--font-poppins), Poppins, Montserrat, ${systemSans}`,
  /** Body & labels — Inter (RULES), Open Sans fallback. */
  body: `var(--font-inter), Inter, 'Open Sans', ${systemSans}`,
  /** Hand-written accent used in hero taglines. */
  script: "var(--font-caveat), Caveat, cursive",
  monospace: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
} as const;

export const fontWeights = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

export const currency = {
  symbol: "৳",
  code: "BDT",
  /** Grouping locale: Bangladesh uses lakh/crore grouping (1,00,000). */
  locale: "en-IN",
} as const;

/**
 * Backwards-compatible shape (`typography.fontFamilyHeadings` etc.).
 */
export const typography = {
  fontFamilyHeadings: fontFamilies.heading,
  fontFamilyBody: fontFamilies.body,
  fontFamilyScript: fontFamilies.script,
  currencySymbol: currency.symbol,
  currencyCode: currency.code,
} as const;
