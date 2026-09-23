import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./globals.css";
import React, { Suspense } from "react";
import {
  MantineProvider,
  ColorSchemeScript,
  mantineHtmlProps,
} from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { Poppins, Inter } from "next/font/google";
import { theme } from "../theme";
import { PageProgressBar } from "../components/PageProgressBar";
import { MobileBottomNav } from "../components/MobileBottomNav";

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

export const metadata = {
  title: "My Oxygen - Healthy Life • Happy You",
  description:
    "From newborn care to motherhood, skincare and inner wear — all essentials for every stage of life across Bangladesh.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${poppins.variable} ${inter.variable}`} {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="light" forceColorScheme="light" />
        <link rel="shortcut icon" href="/favicon.svg" />
        <meta
          name="viewport"
          content="minimum-scale=1, initial-scale=1, width=device-width, user-scalable=no"
        />
      </head>
      <body style={{ backgroundColor: "#FFF8F6", minHeight: "100vh" }}>
        <MantineProvider theme={theme} defaultColorScheme="light" forceColorScheme="light">
          <Suspense fallback={null}>
            <PageProgressBar />
          </Suspense>
          <Notifications position="top-right" />
          {children}
          <MobileBottomNav />
        </MantineProvider>
      </body>
    </html>
  );
}
