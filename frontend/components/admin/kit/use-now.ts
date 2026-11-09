"use client";

import { useEffect, useState } from "react";

/**
 * Current time (epoch ms) that re-renders every `intervalMs`, aligned to the
 * interval boundary (a minute clock ticks exactly on the minute).
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval: number | undefined;
    const align = window.setTimeout(() => {
      setNow(Date.now());
      interval = window.setInterval(() => setNow(Date.now()), intervalMs);
    }, intervalMs - (Date.now() % intervalMs));
    return () => {
      window.clearTimeout(align);
      if (interval !== undefined) {
        window.clearInterval(interval);
      }
    };
  }, [intervalMs]);
  return now;
}
