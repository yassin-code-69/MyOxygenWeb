/**
 * Back-office overrides layered on the global theme (via
 * `MantineThemeProvider` in `AdminShell`, inheriting everything else).
 *
 * The storefront frames cards with the warm brand border and a pink-tinted
 * shadow; on the neutral admin canvas, cards and papers use the neutral
 * border and the soft `xs` shadow instead, matching the kit's SectionCard.
 * Only existing tokens are referenced.
 */
import { Card, Paper, createTheme } from "@mantine/core";

const neutralFrame = { "--paper-border-color": "var(--mo-color-border)" };

export const adminTheme = createTheme({
  components: {
    Card: Card.extend({
      defaultProps: { shadow: "xs" },
      styles: { root: neutralFrame },
    }),
    Paper: Paper.extend({
      styles: { root: neutralFrame },
    }),
  },
});
