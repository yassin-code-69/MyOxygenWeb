### Phase 5 Context & Architecture Blueprint

Phase 5 wires the **My Oxygen design system** directly into the Next.js `apps/web` application. It establishes the Mantine v7 theme as a single source of truth for every colour, radius, shadow, and component style — ensuring that the strict brand palette (#FF6B8B primary pink, #4CAF7D secondary green, #A78BFA accent purple, #FFF8F6 cream canvas) is enforced at the token level and cannot drift across components.

Alongside the theme, Phase 5 defines a **`motion` animation architecture** (the lightweight successor to Framer Motion, imported from the `motion` package) that gives every interactive surface — cards, buttons, skeletons, page transitions — a consistent, production-grade feel. All variant presets are authored once in `apps/web/src/lib/animations.ts` and imported by every component, keeping motion logic DRY and auditable.

Key invariants established in this phase:

- **Brand colour immutability:** Mantine `createTheme()` registers `myPink`, `myGreen`, and `myPurple` as first-class colour scales. No inline hex values appear in component files — they always reference theme tokens.

- **Zero framer-motion import:** The `motion` package (not `framer-motion`) is the animation runtime. All `motion.*` JSX elements come from `import { motion } from "motion/react"`.

- **Cream canvas enforced globally:** `#FFF8F6` is set in `globals.css` as `--color-cream-bg` and applied to `body` — Mantine's `ColorSchemeScript` prevents flash of unstyled content.

- **Skeleton UX parity:** `ProductCardSkeleton` mirrors the real `ProductCard` layout exactly, preventing layout shift on data load.

- **Font hierarchy:** Poppins (headings) and Inter (body) are loaded via `next/font/google` with `display: swap` and subset optimisation to avoid CLS.

---

### Step 1: Next.js App Setup & Dependencies

Configure `apps/web` with the exact package versions and tool integrations needed for Mantine v7 and `motion`. PostCSS is required by Mantine to process its stylesheet at build time.

#### `apps/web/package.json`

```json
{
  "name": "@my-oxygen/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --turbopack",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "@mantine/core": "^7.17.0",
    "@mantine/hooks": "^7.17.0",
    "@mantine/notifications": "^7.17.0",
    "@mantine/carousel": "^7.17.0",
    "@my-oxygen/types": "workspace:*",
    "@my-oxygen/ui-tokens": "workspace:*",
    "motion": "^12.6.0",
    "next": "^15.3.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "postcss": "^8.5.0",
    "postcss-preset-mantine": "^1.17.0",
    "postcss-simple-vars": "^7.0.1",
    "typescript": "^5.7.3"
  }
}
```

#### `apps/web/postcss.config.cjs`

Mantine requires `postcss-preset-mantine` to resolve its CSS variables and responsive utilities at build time.

```javascript
module.exports = {
  plugins: {
    "postcss-preset-mantine": {},
    "postcss-simple-vars": {
      variables: {
        "mantine-breakpoint-xs": "36em",
        "mantine-breakpoint-sm": "48em",
        "mantine-breakpoint-md": "62em",
        "mantine-breakpoint-lg": "75em",
        "mantine-breakpoint-xl": "88em",
      },
    },
  },
};
```

#### `apps/web/next.config.ts`

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile local monorepo packages through Next.js Babel/SWC pipeline
  transpilePackages: ["@my-oxygen/ui-tokens", "@my-oxygen/types"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "images.unsplash.com",
      },
      {
        protocol: "https",
        hostname: "cdn.myoxygen.com",
      },
    ],
  },

  // Strict mode catches stale closures and double-invocation bugs early
  reactStrictMode: true,
};

export default nextConfig;
```

#### `apps/web/tsconfig.json`

```json
{
  "extends": "../../packages/config-typescript/nextjs.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

---

### Step 2: Mantine Theme — My Oxygen Design System

The theme file is the canonical design-system contract. Every shade array is modelled around the brand anchor colour at index `[5]` and lightened/darkened programmatically to yield a coherent 10-step ramp that works for backgrounds, text, borders, and hover states inside Mantine's component variants.

#### `apps/web/src/theme/index.ts`

```typescript
import { createTheme, type MantineColorsTuple } from "@mantine/core";

// ---------------------------------------------------------------------------
// 10-shade colour ramps — index [5] is the brand anchor
// Shades: [0] lightest (tints) → [9] darkest (shades)
// ---------------------------------------------------------------------------

const myPink: MantineColorsTuple = [
  "#fff0f3", // [0] near-white blush — hover backgrounds, subtle fills
  "#ffe0e7", // [1] very light pink — skeleton backgrounds
  "#ffb3c4", // [2] light pink — disabled states
  "#ff85a2", // [3] medium-light — borders, dividers
  "#ff6b8b", // [4] slightly lighter than anchor
  "#ff5579", // [5] PRIMARY BRAND ANCHOR #FF6B8B (active shade)
  "#e63e62", // [6] slightly darker — pressed state
  "#cc2850", // [7] dark pink — text on light backgrounds
  "#a81f40", // [8] deep crimson — high-contrast text
  "#7a1530", // [9] near-black pink — focus rings, accessible text
];

const myGreen: MantineColorsTuple = [
  "#f0faf4", // [0] near-white mint — success backgrounds
  "#d5f2e3", // [1] very light green
  "#aae5c9", // [2] light green — tag backgrounds
  "#6dcca9", // [3] medium-light — icon fills
  "#4caf7d", // [4] slightly lighter than anchor
  "#3d9e6e", // [5] SECONDARY BRAND ANCHOR #4CAF7D
  "#2e8a5c", // [6] darker — hover state
  "#20754c", // [7] dark green — text
  "#165c3b", // [8] deep green — high contrast
  "#0d4029", // [9] near-black green
];

const myPurple: MantineColorsTuple = [
  "#f5f3ff", // [0] near-white lavender — chip backgrounds
  "#ede9fe", // [1] very light purple
  "#ddd6fe", // [2] light purple — hover badge backgrounds
  "#c4b5fd", // [3] medium-light — borders
  "#a78bfa", // [4] slightly lighter than anchor
  "#9061f9", // [5] ACCENT BRAND ANCHOR #A78BFA
  "#7c3aed", // [6] darker — active/pressed
  "#6d28d9", // [7] deep purple — text on light bg
  "#5b21b6", // [8] rich purple — high contrast
  "#4c1d95", // [9] near-black purple
];

// ---------------------------------------------------------------------------
// Theme definition
// ---------------------------------------------------------------------------

export const myOxygenTheme = createTheme({
  // ── Colour Palette ──────────────────────────────────────────────────────
  colors: {
    myPink,
    myGreen,
    myPurple,
  },

  primaryColor: "myPink",
  primaryShade: 5,

  // ── Typography ──────────────────────────────────────────────────────────
  fontFamily: "Inter, Montserrat, sans-serif",
  fontFamilyMonospace: "JetBrains Mono, Menlo, Consolas, monospace",

  headings: {
    fontFamily: "Poppins, sans-serif",
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "2.5rem", lineHeight: "1.2" },
      h2: { fontSize: "2rem", lineHeight: "1.3" },
      h3: { fontSize: "1.5rem", lineHeight: "1.4" },
      h4: { fontSize: "1.25rem", lineHeight: "1.4" },
    },
  },

  fontSizes: {
    xs: "0.75rem",
    sm: "0.875rem",
    md: "1rem",
    lg: "1.125rem",
    xl: "1.25rem",
  },

  lineHeights: {
    xs: "1.4",
    sm: "1.5",
    md: "1.6",
    lg: "1.7",
    xl: "1.8",
  },

  // ── Spacing & Radius ────────────────────────────────────────────────────
  defaultRadius: "md",

  radius: {
    xs: "4px",
    sm: "8px",
    md: "12px",
    lg: "16px",
    xl: "24px",
    pill: "9999px",
  },

  spacing: {
    xs: "0.5rem",
    sm: "0.75rem",
    md: "1rem",
    lg: "1.5rem",
    xl: "2rem",
  },

  // ── Shadows ─────────────────────────────────────────────────────────────
  shadows: {
    xs: "0 1px 3px rgba(31,41,55,0.06)",
    sm: "0 2px 8px rgba(31,41,55,0.08)",
    md: "0 4px 16px rgba(255,107,139,0.10)",
    lg: "0 8px 32px rgba(255,107,139,0.14)",
    xl: "0 16px 64px rgba(255,107,139,0.18)",
    card: "0 2px 12px rgba(31,41,55,0.08), 0 1px 4px rgba(31,41,55,0.04)",
  },

  // ── Breakpoints ──────────────────────────────────────────────────────────
  breakpoints: {
    xs: "36em",
    sm: "48em",
    md: "62em",
    lg: "75em",
    xl: "88em",
  },

  // ── Component Overrides ─────────────────────────────────────────────────
  components: {
    Button: {
      defaultProps: {
        radius: "pill",
      },
      styles: (theme: ReturnType<typeof createTheme>) => ({
        root: {
          // Primary variant: brand pink gradient with lift on hover
          "&[data-variant='filled']": {
            background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
            color: "#FFFFFF",
            fontFamily: "Poppins, sans-serif",
            fontWeight: 600,
            letterSpacing: "0.01em",
            border: "none",
            transition:
              "box-shadow 0.2s ease, transform 0.15s ease, filter 0.2s ease",
            "&:hover": {
              background: "linear-gradient(135deg, #ff5579 0%, #ec4899 100%)",
              boxShadow: "0 6px 20px rgba(255,107,139,0.40)",
              transform: "translateY(-2px)",
              filter: "brightness(1.04)",
            },
            "&:active": {
              transform: "translateY(0px) scale(0.97)",
              boxShadow: "0 2px 8px rgba(255,107,139,0.20)",
            },
          },
          // Secondary/outline variant: brand green
          "&[data-variant='outline']": {
            borderColor: "#4CAF7D",
            color: "#4CAF7D",
            fontFamily: "Poppins, sans-serif",
            fontWeight: 600,
            "&:hover": {
              background: "#f0faf4",
              borderColor: "#3d9e6e",
              color: "#3d9e6e",
            },
          },
          // Ghost/subtle variant
          "&[data-variant='subtle']": {
            color: "#FF6B8B",
            "&:hover": {
              background: "#fff0f3",
            },
          },
        },
      }),
    },

    Card: {
      defaultProps: {
        radius: "lg",
        shadow: "card",
        padding: "lg",
      },
      styles: {
        root: {
          backgroundColor: "#FFFFFF",
          border: "1px solid rgba(255,107,139,0.08)",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          "&:hover": {
            boxShadow: "0 8px 32px rgba(255,107,139,0.14)",
          },
        },
      },
    },

    Badge: {
      defaultProps: {
        radius: "pill",
        variant: "light",
      },
      styles: {
        root: {
          fontFamily: "Inter, sans-serif",
          fontWeight: 600,
          letterSpacing: "0.03em",
          textTransform: "none" as const,
          fontSize: "0.75rem",
        },
      },
    },

    Skeleton: {
      styles: {
        root: {
          // Slightly faster animation than Mantine default (1.5s → 1.2s)
          "--skeleton-animation-duration": "1.2s",
          "&::before": {
            background:
              "linear-gradient(90deg, #fff0f3 25%, #ffe0e7 50%, #fff0f3 75%)",
          },
        },
      },
    },

    TextInput: {
      styles: {
        input: {
          borderColor: "rgba(107,114,128,0.30)",
          "&:focus": {
            borderColor: "#4CAF7D",
            boxShadow: "0 0 0 2px rgba(76,175,125,0.20)",
          },
        },
      },
    },

    Select: {
      styles: {
        input: {
          borderColor: "rgba(107,114,128,0.30)",
          "&:focus": {
            borderColor: "#4CAF7D",
            boxShadow: "0 0 0 2px rgba(76,175,125,0.20)",
          },
        },
      },
    },

    Notification: {
      styles: {
        root: {
          borderRadius: "12px",
          boxShadow: "0 4px 16px rgba(31,41,55,0.12)",
        },
      },
    },
  },

  // ── Custom Tokens (via `other`) ──────────────────────────────────────────
  // Access in components via: useMantineTheme().other.brandGradient
  other: {
    brandGradient: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
    brandGradientSecondary: "linear-gradient(135deg, #4CAF7D 0%, #A78BFA 100%)",
    cardShadow: "0 2px 12px rgba(31,41,55,0.08), 0 1px 4px rgba(31,41,55,0.04)",
    cardShadowHover: "0 8px 32px rgba(255,107,139,0.14)",
    creamBg: "#FFF8F6",
    surfaceWhite: "#FFFFFF",
    darkText: "#1F2937",
    textGray: "#6B7280",
    successColor: "#10B981",
    warningColor: "#F59E0B",
    errorColor: "#EF4444",
    poppins: "Poppins, sans-serif",
    inter: "Inter, Montserrat, sans-serif",
  },
});

export type MyOxygenTheme = typeof myOxygenTheme;
```

---

### Step 3: Root Layout & MantineProvider

The root layout wraps the entire Next.js App Router tree. `ColorSchemeScript` must appear in `<head>` to avoid flash of unstyled content. Fonts are loaded once here via `next/font/google` with CSS variable injection so both Mantine and raw CSS can reference them.

#### `apps/web/src/app/layout.tsx`

```tsx
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@mantine/carousel/styles.css";
import "./globals.css";

import type { Metadata, Viewport } from "next";
import { Poppins, Inter } from "next/font/google";
import {
  ColorSchemeScript,
  MantineProvider,
  mantineHtmlProps,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { myOxygenTheme } from "@/theme";

// ---------------------------------------------------------------------------
// Font loading — next/font handles subsetting & self-hosting automatically
// ---------------------------------------------------------------------------

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
  preload: true,
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

export const metadata: Metadata = {
  title: {
    default: "My Oxygen — Maternal & Newborn Care",
    template: "%s | My Oxygen",
  },
  description:
    "Premium maternal and newborn health products. Safe, certified, delivered across Bangladesh.",
  keywords: [
    "maternal care",
    "newborn",
    "baby products",
    "skincare",
    "Bangladesh",
  ],
  metadataBase: new URL("https://myoxygen.com"),
  openGraph: {
    type: "website",
    locale: "en_BD",
    url: "https://myoxygen.com",
    siteName: "My Oxygen",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FF6B8B",
};

// ---------------------------------------------------------------------------
// Root Layout
// ---------------------------------------------------------------------------

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      {...mantineHtmlProps}
      className={`${poppins.variable} ${inter.variable}`}
    >
      <head>
        {/*
         * ColorSchemeScript MUST be in <head> to prevent flash of unstyled
         * content when Mantine hydrates colour scheme from localStorage.
         */}
        <ColorSchemeScript defaultColorScheme="light" />
      </head>
      <body>
        <MantineProvider theme={myOxygenTheme} defaultColorScheme="light">
          {/*
           * Notifications portal — renders toasts outside the normal
           * React tree so z-index stacking is always correct.
           */}
          <Notifications
            position="top-right"
            zIndex={9999}
            limit={5}
            autoClose={4000}
          />
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

---

### Step 4: `motion` Animation Variants & Presets

All animation definitions live in a single file and are exported as named constants. Components import only what they need, keeping bundle size minimal. The `motion` package (v12+) uses `import { motion } from "motion/react"` for React integration.

#### `apps/web/src/lib/animations.ts`

```typescript
import type { Variants, Transition } from "motion/react";

// ---------------------------------------------------------------------------
// Shared transition presets
// ---------------------------------------------------------------------------

export const easeOut: Transition = {
  type: "tween",
  ease: [0.16, 1, 0.3, 1], // custom expo ease-out
  duration: 0.4,
};

export const spring: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 28,
  mass: 0.8,
};

export const springFast: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 30,
  mass: 0.6,
};

// ---------------------------------------------------------------------------
// Fade + slide variants
// ---------------------------------------------------------------------------

/** Slide up 20px while fading in. Use on content sections & list items. */
export const fadeInUp: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: easeOut,
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2, ease: "easeIn" },
  },
};

/** Fade in with a gentle scale from 0.95 → 1. Use on modals & overlays. */
export const fadeInScale: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 350,
      damping: 25,
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

// ---------------------------------------------------------------------------
// Stagger container / children
// ---------------------------------------------------------------------------

/**
 * Parent wrapper that staggers its children by 80ms each.
 * Combine with `staggerItem` on child elements.
 *
 * @example
 * <motion.ul variants={staggerContainer} initial="hidden" animate="visible">
 *   {items.map(i => <motion.li key={i.id} variants={staggerItem}>…</motion.li>)}
 * </motion.ul>
 */
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
};

/** Individual item animated by a `staggerContainer` parent. */
export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 16,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: easeOut,
  },
};

// ---------------------------------------------------------------------------
// Page-level transition
// ---------------------------------------------------------------------------

/**
 * Route-level entrance/exit. Apply to the top-level page wrapper.
 *
 * @example
 * <motion.main variants={pageTransition} initial="hidden" animate="visible" exit="exit">
 */
export const pageTransition: Variants = {
  hidden: {
    opacity: 0,
    y: 8,
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

// ---------------------------------------------------------------------------
// Shimmer / skeleton loader
// ---------------------------------------------------------------------------

/**
 * Horizontal shimmer sweep for skeleton loaders.
 * Use as `animate` prop on a motion overlay div.
 *
 * @example
 * <motion.div
 *   animate={shimmerSlide.animate}
 *   transition={shimmerSlide.transition}
 *   style={shimmerSlide.style}
 * />
 */
export const shimmerSlide = {
  animate: {
    x: ["-100%", "100%"],
  },
  transition: {
    duration: 1.4,
    repeat: Infinity,
    repeatType: "loop" as const,
    ease: "linear",
  },
  style: {
    position: "absolute" as const,
    inset: 0,
    background:
      "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
    pointerEvents: "none" as const,
  },
} as const;

// ---------------------------------------------------------------------------
// Interactive micro-animations (whileHover / whileTap)
// ---------------------------------------------------------------------------

/**
 * Card lift on hover. Apply directly to the `motion.div` wrapping a card.
 *
 * @example
 * <motion.div whileHover={cardHover.hover} transition={cardHover.transition}>
 */
export const cardHover = {
  hover: {
    scale: 1.02,
    y: -4,
  },
  transition: spring,
} as const;

/**
 * Button press-down scale. Apply as `whileTap` to interactive elements.
 *
 * @example
 * <motion.button whileTap={buttonPress}>
 */
export const buttonPress = {
  scale: 0.97,
} as const;

/**
 * Wishlist heart pulse — scale pop when toggled.
 * Use with `animate` driven by a state toggle.
 */
export const heartPulse: Variants = {
  inactive: {
    scale: 1,
  },
  active: {
    scale: [1, 1.35, 0.9, 1.1, 1],
    transition: {
      duration: 0.45,
      times: [0, 0.25, 0.5, 0.75, 1],
      ease: "easeInOut",
    },
  },
};

/**
 * Gentle floating animation for decorative elements.
 * Repeat indefinitely via `animate`.
 */
export const floatLoop: Variants = {
  initial: { y: 0 },
  animate: {
    y: [-6, 6, -6],
    transition: {
      duration: 4,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};
```

---

### Step 5: Reusable Animated Skeleton Components

Skeleton components must mirror the exact layout of their real counterparts to prevent cumulative layout shift (CLS). The `motion` shimmer overlay adds a polished sweep effect on top of Mantine's base skeleton colour.

#### `apps/web/src/components/ui/ProductCardSkeleton.tsx`

```tsx
"use client";

import { Card, Skeleton, Stack, Group, Box } from "@mantine/core";
import { motion } from "motion/react";
import { shimmerSlide, staggerContainer, staggerItem } from "@/lib/animations";

interface ProductCardSkeletonProps {
  /** Number of skeleton cards to render (default: 1). */
  count?: number;
}

/** Single skeleton card — layout mirrors `ProductCard` exactly. */
function SingleSkeleton() {
  return (
    <Card
      radius="lg"
      padding={0}
      style={{
        backgroundColor: "#FFFFFF",
        border: "1px solid rgba(255,107,139,0.08)",
        overflow: "hidden",
      }}
    >
      {/* Image placeholder */}
      <Box
        style={{ position: "relative", aspectRatio: "4/3", overflow: "hidden" }}
      >
        <Skeleton height="100%" radius={0} />
        {/* Shimmer sweep overlay */}
        <motion.div
          animate={shimmerSlide.animate}
          transition={shimmerSlide.transition}
          style={shimmerSlide.style}
        />
      </Box>

      {/* Content area */}
      <Stack gap="sm" p="md">
        {/* Category chip placeholder */}
        <Skeleton height={22} width={80} radius="pill" />

        {/* Title — two lines */}
        <Stack gap={6}>
          <Box style={{ position: "relative", overflow: "hidden" }}>
            <Skeleton height={16} radius="sm" />
            <motion.div
              animate={shimmerSlide.animate}
              transition={{ ...shimmerSlide.transition, delay: 0.1 }}
              style={shimmerSlide.style}
            />
          </Box>
          <Box style={{ position: "relative", overflow: "hidden" }}>
            <Skeleton height={16} width="70%" radius="sm" />
            <motion.div
              animate={shimmerSlide.animate}
              transition={{ ...shimmerSlide.transition, delay: 0.15 }}
              style={shimmerSlide.style}
            />
          </Box>
        </Stack>

        {/* Price row */}
        <Group justify="space-between" align="center" mt={4}>
          <Box style={{ position: "relative", overflow: "hidden" }}>
            <Skeleton height={24} width={90} radius="sm" />
            <motion.div
              animate={shimmerSlide.animate}
              transition={{ ...shimmerSlide.transition, delay: 0.2 }}
              style={shimmerSlide.style}
            />
          </Box>
          <Skeleton height={18} width={50} radius="sm" />
        </Group>

        {/* CTA button */}
        <Box style={{ position: "relative", overflow: "hidden" }}>
          <Skeleton height={40} radius="pill" mt={4} />
          <motion.div
            animate={shimmerSlide.animate}
            transition={{ ...shimmerSlide.transition, delay: 0.25 }}
            style={shimmerSlide.style}
          />
        </Box>
      </Stack>
    </Card>
  );
}

/** Renders one or more animated shimmer skeleton cards. */
export function ProductCardSkeleton({ count = 1 }: ProductCardSkeletonProps) {
  if (count === 1) return <SingleSkeleton />;

  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "1.5rem",
      }}
    >
      {Array.from({ length: count }).map((_, i) => (
        <motion.div key={i} variants={staggerItem}>
          <SingleSkeleton />
        </motion.div>
      ))}
    </motion.div>
  );
}
```

#### `apps/web/src/components/ui/PageLoader.tsx`

```tsx
"use client";

import { Box, Text } from "@mantine/core";
import { motion } from "motion/react";
import { fadeInScale } from "@/lib/animations";

/**
 * Full-viewport loading screen shown during initial page hydration or
 * Suspense boundaries. Renders a text-based My Oxygen logo with a
 * brand-pink animated pulse ring.
 */
export function PageLoader() {
  return (
    <motion.div
      key="page-loader"
      variants={fadeInScale}
      initial="hidden"
      animate="visible"
      exit="exit"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#FFF8F6",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        zIndex: 9998,
      }}
    >
      {/* Pulse ring stack */}
      <Box style={{ position: "relative", width: 96, height: 96 }}>
        {/* Outermost pulse ring — slowest */}
        <motion.div
          animate={{
            scale: [1, 1.6],
            opacity: [0.4, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: 0,
          }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid #FF6B8B",
          }}
        />

        {/* Middle pulse ring */}
        <motion.div
          animate={{
            scale: [1, 1.4],
            opacity: [0.5, 0],
          }}
          transition={{
            duration: 1.8,
            repeat: Infinity,
            ease: "easeOut",
            delay: 0.3,
          }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            border: "2px solid #FF6B8B",
          }}
        />

        {/* Inner solid circle — static brand pink */}
        <motion.div
          animate={{ scale: [0.95, 1.05, 0.95] }}
          transition={{
            duration: 2.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            inset: "18px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 4px 16px rgba(255,107,139,0.40)",
          }}
        >
          {/* Oxygen symbol — simplified 'O₂' text logo */}
          <Text
            style={{
              fontFamily: "Poppins, sans-serif",
              fontWeight: 700,
              fontSize: "1.1rem",
              color: "#FFFFFF",
              letterSpacing: "-0.02em",
              lineHeight: 1,
              userSelect: "none",
            }}
          >
            O₂
          </Text>
        </motion.div>
      </Box>

      {/* Brand wordmark */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.4, ease: "easeOut" }}
        style={{ textAlign: "center" }}
      >
        <Text
          style={{
            fontFamily: "Poppins, sans-serif",
            fontWeight: 700,
            fontSize: "1.5rem",
            color: "#1F2937",
            letterSpacing: "-0.01em",
          }}
        >
          My Oxygen
        </Text>
        <Text
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: "0.8rem",
            color: "#6B7280",
            marginTop: "2px",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Maternal & Newborn Care
        </Text>
      </motion.div>

      {/* Loading dots */}
      <Group gap={6}>
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            animate={{ scale: [1, 1.4, 1], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.18,
              ease: "easeInOut",
            }}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: "#FF6B8B",
            }}
          />
        ))}
      </Group>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Internal helper — not exported (used only within PageLoader)
// ---------------------------------------------------------------------------

function Group({ children, gap }: { children: React.ReactNode; gap: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap }}>{children}</div>
  );
}
```

---

### Step 6: Animated Product Card Component

The `ProductCard` is the primary revenue-generating component. It combines Mantine layout primitives with `motion` interactivity to produce a polished, accessible card that respects brand constraints strictly.

#### `apps/web/src/components/ui/ProductCard.tsx`

```tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Card,
  Badge,
  Text,
  Group,
  Stack,
  ActionIcon,
  Box,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { motion, AnimatePresence } from "motion/react";
import {
  cardHover,
  buttonPress,
  heartPulse,
  staggerItem,
  fadeInScale,
} from "@/lib/animations";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProductCardProduct {
  id: string;
  title: string;
  slug: string;
  /** Array of image URLs — first element used as primary. */
  images: string[];
  /** Original retail price in BDT (Bangladeshi Taka). */
  basePrice: number;
  /** Final price after any active discounts. */
  effectivePrice: number;
  /** 0–100. Present when a discount is active. */
  discountPercent: number;
  /** Total units currently in stock across all batches. */
  totalAvailable: number;
  /** True when totalAvailable ≤ product.lowStockThreshold. */
  isLowStock: boolean;
  categoryName: string;
}

interface ProductCardProps {
  product: ProductCardProduct;
  /** Called when user clicks Add to Cart. */
  onAddToCart?: (productId: string) => void | Promise<void>;
  /** Called when wishlist state changes. */
  onWishlistToggle?: (productId: string, wishlisted: boolean) => void;
  /** Pre-set wishlist state (e.g. from user session). */
  initialWishlisted?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProductCard({
  product,
  onAddToCart,
  onWishlistToggle,
  initialWishlisted = false,
}: ProductCardProps) {
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [isImageHovered, setIsImageHovered] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);

  const isDiscounted = product.discountPercent > 0;
  const isFlashSale = product.discountPercent >= 20; // Flash sale threshold: ≥20% off
  const isOutOfStock = product.totalAvailable === 0;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function handleWishlistToggle(e: React.MouseEvent) {
    e.preventDefault(); // Prevent Link navigation
    const nextState = !wishlisted;
    setWishlisted(nextState);
    onWishlistToggle?.(product.id, nextState);

    notifications.show({
      message: nextState
        ? `"${product.title}" added to wishlist`
        : `"${product.title}" removed from wishlist`,
      color: nextState ? "myPink" : "gray",
      autoClose: 2500,
    });
  }

  async function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault();
    if (isOutOfStock || isAddingToCart) return;

    setIsAddingToCart(true);
    try {
      await onAddToCart?.(product.id);
      notifications.show({
        title: "Added to cart!",
        message: `${product.title} is in your cart.`,
        color: "myGreen",
        autoClose: 3000,
      });
    } catch {
      notifications.show({
        title: "Failed to add",
        message: "Please try again.",
        color: "red",
      });
    } finally {
      setIsAddingToCart(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={staggerItem}
      whileHover={cardHover.hover}
      transition={cardHover.transition}
      style={{ height: "100%" }}
    >
      <Link
        href={`/products/${product.slug}`}
        style={{ textDecoration: "none" }}
      >
        <Card
          padding={0}
          radius="lg"
          style={{
            backgroundColor: "#FFFFFF",
            border: "1px solid rgba(255,107,139,0.08)",
            overflow: "hidden",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            cursor: "pointer",
          }}
        >
          {/* ── Image container ─────────────────────────────────────────── */}
          <Box
            style={{
              position: "relative",
              aspectRatio: "4/3",
              overflow: "hidden",
            }}
            onMouseEnter={() => setIsImageHovered(true)}
            onMouseLeave={() => setIsImageHovered(false)}
          >
            {product.images[0] ? (
              <motion.div
                animate={{ scale: isImageHovered ? 1.06 : 1 }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{ width: "100%", height: "100%", position: "relative" }}
              >
                <Image
                  src={product.images[0]}
                  alt={product.title}
                  fill
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  style={{ objectFit: "cover" }}
                  priority={false}
                />
              </motion.div>
            ) : (
              /* Fallback placeholder */
              <Box
                style={{
                  width: "100%",
                  height: "100%",
                  background:
                    "linear-gradient(135deg, #fff0f3 0%, #ffe0e7 100%)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: "2.5rem" }}>🌸</Text>
              </Box>
            )}

            {/* Dark overlay on hover */}
            <AnimatePresence>
              {isImageHovered && (
                <motion.div
                  key="overlay"
                  variants={fadeInScale}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(31,41,55,0.12)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </AnimatePresence>

            {/* ── Badge stack (top-left) ─────────────────────────────── */}
            <Stack gap={6} style={{ position: "absolute", top: 10, left: 10 }}>
              {isFlashSale && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, duration: 0.3 }}
                >
                  <Badge
                    size="sm"
                    radius="pill"
                    style={{
                      background:
                        "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                      color: "#FFFFFF",
                      fontWeight: 700,
                      fontSize: "0.7rem",
                      boxShadow: "0 2px 8px rgba(255,107,139,0.40)",
                    }}
                  >
                    ⚡ Flash {product.discountPercent}% OFF
                  </Badge>
                </motion.div>
              )}

              {!isFlashSale && isDiscounted && (
                <Badge
                  size="sm"
                  radius="pill"
                  style={{ backgroundColor: "#EF4444", color: "#FFFFFF" }}
                >
                  {product.discountPercent}% OFF
                </Badge>
              )}

              {product.isLowStock && !isOutOfStock && (
                <Badge
                  size="sm"
                  radius="pill"
                  style={{
                    backgroundColor: "#FEF3C7",
                    color: "#92400E",
                    border: "1px solid #F59E0B",
                  }}
                >
                  🔥 Low Stock
                </Badge>
              )}

              {isOutOfStock && (
                <Badge
                  size="sm"
                  radius="pill"
                  style={{ backgroundColor: "#F3F4F6", color: "#6B7280" }}
                >
                  Out of Stock
                </Badge>
              )}
            </Stack>

            {/* ── Wishlist toggle (top-right) ───────────────────────── */}
            <Box style={{ position: "absolute", top: 10, right: 10 }}>
              <motion.div
                whileTap={buttonPress}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <ActionIcon
                  size="md"
                  radius="xl"
                  variant="filled"
                  onClick={handleWishlistToggle}
                  style={{
                    backgroundColor: "rgba(255,255,255,0.92)",
                    backdropFilter: "blur(8px)",
                    border: "1px solid rgba(255,107,139,0.12)",
                    boxShadow: "0 2px 8px rgba(31,41,55,0.10)",
                  }}
                  aria-label={
                    wishlisted ? "Remove from wishlist" : "Add to wishlist"
                  }
                >
                  <motion.span
                    key={wishlisted ? "wishlisted" : "not-wishlisted"}
                    variants={heartPulse}
                    initial="inactive"
                    animate="active"
                    style={{
                      fontSize: "1rem",
                      display: "block",
                      lineHeight: 1,
                      filter: wishlisted
                        ? "drop-shadow(0 0 4px rgba(255,107,139,0.6))"
                        : "none",
                    }}
                  >
                    {wishlisted ? "❤️" : "🤍"}
                  </motion.span>
                </ActionIcon>
              </motion.div>
            </Box>
          </Box>

          {/* ── Card body ─────────────────────────────────────────────────── */}
          <Stack
            gap="sm"
            p="md"
            style={{ flex: 1, display: "flex", flexDirection: "column" }}
          >
            {/* Category chip */}
            <Badge
              size="xs"
              radius="pill"
              variant="light"
              style={{
                backgroundColor: "rgba(167,139,250,0.12)",
                color: "#7c3aed",
                border: "1px solid rgba(167,139,250,0.24)",
                width: "fit-content",
              }}
            >
              {product.categoryName}
            </Badge>

            {/* Title */}
            <Text
              lineClamp={2}
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 600,
                fontSize: "0.95rem",
                color: "#1F2937",
                lineHeight: 1.4,
                flex: 1,
              }}
            >
              {product.title}
            </Text>

            {/* Price row */}
            <Group justify="space-between" align="center">
              <Group gap="xs" align="baseline">
                <Text
                  style={{
                    fontFamily: "Poppins, sans-serif",
                    fontWeight: 700,
                    fontSize: "1.15rem",
                    color: "#FF6B8B",
                    lineHeight: 1,
                  }}
                >
                  ৳{product.effectivePrice.toLocaleString("en-BD")}
                </Text>

                {isDiscounted && (
                  <Text
                    style={{
                      fontFamily: "Inter, sans-serif",
                      fontSize: "0.8rem",
                      color: "#6B7280",
                      textDecoration: "line-through",
                      lineHeight: 1,
                    }}
                  >
                    ৳{product.basePrice.toLocaleString("en-BD")}
                  </Text>
                )}
              </Group>

              {/* Stock count hint */}
              {!isOutOfStock && (
                <Text
                  style={{
                    fontSize: "0.72rem",
                    color: product.isLowStock ? "#F59E0B" : "#10B981",
                    fontWeight: 500,
                  }}
                >
                  {product.isLowStock
                    ? `${product.totalAvailable} left`
                    : "In stock"}
                </Text>
              )}
            </Group>

            {/* Add to Cart CTA */}
            <motion.button
              whileTap={buttonPress}
              onClick={handleAddToCart}
              disabled={isOutOfStock || isAddingToCart}
              style={{
                marginTop: "auto",
                width: "100%",
                padding: "10px 0",
                borderRadius: "9999px",
                border: "none",
                cursor:
                  isOutOfStock || isAddingToCart ? "not-allowed" : "pointer",
                background: isOutOfStock
                  ? "#F3F4F6"
                  : "linear-gradient(135deg, #FF6B8B 0%, #F472B6 100%)",
                color: isOutOfStock ? "#9CA3AF" : "#FFFFFF",
                fontFamily: "Poppins, sans-serif",
                fontWeight: 600,
                fontSize: "0.875rem",
                letterSpacing: "0.01em",
                transition: "box-shadow 0.2s ease, filter 0.2s ease",
                boxShadow: isOutOfStock
                  ? "none"
                  : "0 4px 14px rgba(255,107,139,0.30)",
              }}
            >
              <AnimatePresence mode="wait">
                {isAddingToCart ? (
                  <motion.span
                    key="adding"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    Adding…
                  </motion.span>
                ) : isOutOfStock ? (
                  <motion.span key="oos">Out of Stock</motion.span>
                ) : (
                  <motion.span
                    key="add"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    🛒 Add to Cart
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          </Stack>
        </Card>
      </Link>
    </motion.div>
  );
}
```

---

### Step 7: Global CSS & Font Variables

#### `apps/web/src/app/globals.css`

```css
/*
 * My Oxygen — Global Stylesheet
 * All brand colours defined as CSS custom properties so they are
 * accessible from plain CSS, inline styles, and Mantine theme alike.
 */

/* ---------------------------------------------------------------------------
   1. Brand Design Tokens
--------------------------------------------------------------------------- */

:root {
  /* Core brand */
  --color-primary-pink: #ff6b8b;
  --color-primary-pink-dark: #ff5579;
  --color-primary-pink-light: #ffb3c4;

  --color-secondary-green: #4caf7d;
  --color-secondary-green-dark: #3d9e6e;
  --color-secondary-green-light: #aae5c9;

  --color-accent-purple: #a78bfa;
  --color-accent-purple-dark: #9061f9;
  --color-accent-purple-light: #ddd6fe;

  /* Canvas & surfaces */
  --color-cream-bg: #fff8f6;
  --color-surface-white: #ffffff;

  /* Typography */
  --color-dark-text: #1f2937;
  --color-text-gray: #6b7280;

  /* Status colours */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;

  /* Gradients */
  --gradient-primary: linear-gradient(135deg, #ff6b8b 0%, #f472b6 100%);
  --gradient-secondary: linear-gradient(135deg, #4caf7d 0%, #a78bfa 100%);

  /* Shadows */
  --shadow-card:
    0 2px 12px rgba(31, 41, 55, 0.08), 0 1px 4px rgba(31, 41, 55, 0.04);
  --shadow-card-hover: 0 8px 32px rgba(255, 107, 139, 0.14);
  --shadow-button: 0 4px 14px rgba(255, 107, 139, 0.3);

  /* Font families — injected by next/font via CSS vars */
  --font-poppins: var(--font-poppins, "Poppins", sans-serif);
  --font-inter: var(--font-inter, "Inter", "Montserrat", sans-serif);

  /* Spacing scale */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-12: 3rem;
  --space-16: 4rem;
}

/* ---------------------------------------------------------------------------
   2. Global Reset & Base
--------------------------------------------------------------------------- */

*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

body {
  background-color: var(--color-cream-bg);
  color: var(--color-dark-text);
  font-family: var(--font-inter);
  font-size: 1rem;
  line-height: 1.6;
  min-height: 100dvh;
}

/* ---------------------------------------------------------------------------
   3. Typography
--------------------------------------------------------------------------- */

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: var(--font-poppins);
  font-weight: 700;
  color: var(--color-dark-text);
  line-height: 1.2;
}

p {
  color: var(--color-text-gray);
  line-height: 1.7;
}

a {
  color: var(--color-primary-pink);
  text-decoration: none;
  transition: color 0.2s ease;
}

a:hover {
  color: var(--color-primary-pink-dark);
}

/* ---------------------------------------------------------------------------
   4. Text Selection
--------------------------------------------------------------------------- */

::selection {
  background-color: rgba(255, 107, 139, 0.2);
  color: var(--color-dark-text);
}

::-moz-selection {
  background-color: rgba(255, 107, 139, 0.2);
  color: var(--color-dark-text);
}

/* ---------------------------------------------------------------------------
   5. Focus Ring — brand green for accessibility
--------------------------------------------------------------------------- */

:focus-visible {
  outline: 2px solid var(--color-secondary-green);
  outline-offset: 3px;
  border-radius: 4px;
}

/* Override Mantine's default focus ring */
.mantine-focus-auto:focus-visible,
.mantine-focus-always {
  outline: 2px solid var(--color-secondary-green) !important;
  outline-offset: 3px !important;
}

/* ---------------------------------------------------------------------------
   6. Scrollbar Styling (Webkit / Chromium)
--------------------------------------------------------------------------- */

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--color-cream-bg);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 107, 139, 0.3);
  border-radius: 4px;
  border: 2px solid var(--color-cream-bg);
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 107, 139, 0.55);
}

/* Firefox */
* {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 107, 139, 0.35) var(--color-cream-bg);
}

/* ---------------------------------------------------------------------------
   7. Image defaults
--------------------------------------------------------------------------- */

img,
video {
  max-width: 100%;
  display: block;
}

/* ---------------------------------------------------------------------------
   8. Utility classes
--------------------------------------------------------------------------- */

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.gradient-text {
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.gradient-text-secondary {
  background: var(--gradient-secondary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.cream-surface {
  background-color: var(--color-cream-bg);
}

.card-shadow {
  box-shadow: var(--shadow-card);
}
```

---

### Step 8: Phase 5 Verification Checklist

Execute these checks sequentially before moving to Phase 6.

1. **Dependency installation & PostCSS pipeline:**

```bash
pnpm --filter @my-oxygen/web install
pnpm --filter @my-oxygen/web build
```

_Expected outcome:_ Build succeeds. PostCSS processes `@mantine/core/styles.css` without errors. No missing peer dependency warnings for `motion`.

2. **Theme token smoke test — dev server:**

```bash
pnpm --filter @my-oxygen/web dev
```

Open `http://localhost:3000`. Verify:

- Page canvas is `#FFF8F6` (cream), not white.
- Browser `<title>` reads `My Oxygen — Maternal & Newborn Care`.
- No FOUC (flash of unstyled content) on hard-refresh — confirms `ColorSchemeScript` is in `<head>`.

3. **Font rendering check:**

In DevTools → Network, confirm two font woffs load with `font-display: swap` from `/_next/static/media/`. Inspect `document.body` computed style:

```
font-family: Inter, Montserrat, sans-serif  ✓
```

Inspect any `<h1>`:

```
font-family: Poppins, sans-serif  ✓
```

4. **Mantine component override verification:**

Render a test page with a `<Button variant="filled">Add to Cart</Button>`:

- Button should display a pink gradient (`#FF6B8B → #F472B6`), not the Mantine default blue.
- Hover: box-shadow appears, button lifts 2px.
- Click: button scales down to 0.97.

5. **`motion` animation verification:**

Import `ProductCard` in a test page and pass a mock product:

```tsx
<ProductCard
  product={{
    id: "test-001",
    title: "Organic Baby Lotion",
    slug: "organic-baby-lotion",
    images: [
      "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800",
    ],
    basePrice: 850,
    effectivePrice: 680,
    discountPercent: 20,
    totalAvailable: 4,
    isLowStock: true,
    categoryName: "Newborn",
  }}
/>
```

Verify:

- Card lifts and scales on hover (spring animation, not janky linear).
- Flash Sale badge appears (discountPercent ≥ 20).
- Low Stock warning badge visible.
- Heart icon toggles ❤️/🤍 with scale pulse on click.
- "Add to Cart" button shows "Adding…" on click, then success toast.

6. **Skeleton component verification:**

```tsx
import { ProductCardSkeleton } from "@/components/ui/ProductCardSkeleton";

<ProductCardSkeleton count={4} />;
```

Confirm:

- Four skeletons render in a responsive grid.
- Shimmer sweeps left-to-right on each skeleton element — confirms `motion` keyframe animation is firing.
- Layout matches real `ProductCard` dimensions (no height mismatch).

7. **PageLoader verification:**

```tsx
import { PageLoader } from "@/components/ui/PageLoader";

// Temporarily render at root:
<PageLoader />;
```

Confirm:

- Full viewport covered with cream background.
- Pink gradient circle pulses outward with two concentric rings.
- `O₂` glyph visible and centred.
- Three loading dots animate sequentially with staggered delay.

8. **CSS custom properties & scrollbar:**

Open DevTools → Elements → `<html>` → Computed → Search `--color-primary-pink`:

```
--color-primary-pink: #FF6B8B  ✓
```

Scroll any long page — scrollbar thumb should be translucent pink, not browser default grey.

9. **TypeScript strict check:**

```bash
pnpm --filter @my-oxygen/web type-check
```

_Expected outcome:_ Zero type errors. `ProductCardProduct` interface fully satisfies all prop usages in `ProductCard.tsx`.
