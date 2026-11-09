import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/carousel/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import { Suspense, type ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { Caveat, Inter, Poppins } from "next/font/google";
import { ColorSchemeScript, mantineHtmlProps } from "@mantine/core";
import { AppProviders } from "../components/AppProviders";
import { PageProgressBar } from "../components/PageProgressBar";
import { MobileBottomNav } from "../components/MobileBottomNav";
import { brand } from "../tokens/colors";

const poppins = Poppins({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-poppins",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

/** Hand-written accent used by hero / footer taglines. */
const caveat = Caveat({
  weight: ["600", "700"],
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});

const SITE_NAME = "My Oxygen";
const SITE_DESCRIPTION =
  "From newborn care to motherhood, skincare and inner wear — trusted essentials for every stage of life, delivered across Bangladesh.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: `${SITE_NAME} — Healthy Life • Happy You`,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "My Oxygen",
    "baby care Bangladesh",
    "newborn essentials",
    "mother care",
    "skin care",
    "inner wear",
    "Dhaka",
  ],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "en_BD",
    url: "/",
    title: `${SITE_NAME} — Healthy Life • Happy You`,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: "/images/hero-mother-baby.jpg",
        alt: "Mother holding her baby — My Oxygen mother & baby care",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — Healthy Life • Happy You`,
    description: SITE_DESCRIPTION,
    images: ["/images/hero-mother-baby.jpg"],
  },
  icons: {
    icon: [{ url: "/icons/logo-heart.svg", type: "image/svg+xml" }],
    shortcut: "/icons/logo-heart.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // User zoom stays enabled (WCAG 1.4.4).
  themeColor: brand.primary,
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${inter.variable} ${caveat.variable}`}
      {...mantineHtmlProps}
    >
      <head>
        <ColorSchemeScript defaultColorScheme="light" forceColorScheme="light" />
      </head>
      <body>
        <a href="#main-content" className="mo-skip-link">
          Skip to main content
        </a>
        <AppProviders>
          <Suspense fallback={null}>
            <PageProgressBar />
          </Suspense>
          {children}
          {/* Single global mount — pages must not render their own MobileBottomNav. */}
          <MobileBottomNav />
        </AppProviders>
      </body>
    </html>
  );
}
