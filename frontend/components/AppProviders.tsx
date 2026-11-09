"use client";

import type { ReactNode } from "react";
import { MantineProvider } from "@mantine/core";
import { DatesProvider } from "@mantine/dates";
import { Notifications } from "@mantine/notifications";
import { MotionConfig } from "motion/react";
import { cssVariablesResolver, theme } from "../theme";
import { zIndex } from "../tokens";

/**
 * Bangladesh calendar conventions for @mantine/dates pickers:
 * week starts Saturday, weekend = Friday + Saturday.
 * Dates are exchanged as `YYYY-MM-DD` strings (Mantine 8+ default), so no
 * timezone conversion happens in the browser; the backend interprets them in Asia/Dhaka.
 */
const DATES_SETTINGS = {
  locale: "en",
  firstDayOfWeek: 6,
  weekendDays: [5, 6],
} as const;

export interface AppProvidersProps {
  children: ReactNode;
}

/**
 * Client-side providers mounted once by `app/layout.tsx`:
 * Mantine (forced light scheme + token CSS variables), date pickers, toast
 * notifications, and Motion with `reducedMotion="user"`.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <MantineProvider
      theme={theme}
      cssVariablesResolver={cssVariablesResolver}
      defaultColorScheme="light"
      forceColorScheme="light"
    >
      <DatesProvider settings={{ ...DATES_SETTINGS, weekendDays: [...DATES_SETTINGS.weekendDays] }}>
        <MotionConfig reducedMotion="user">
          <Notifications position="top-right" limit={4} zIndex={zIndex.toast} />
          {children}
        </MotionConfig>
      </DatesProvider>
    </MantineProvider>
  );
}
