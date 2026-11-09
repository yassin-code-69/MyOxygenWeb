"use client";

import { useEffect, useState } from "react";

/**
 * `true` once the window is scrolled more than `threshold` px. Re-renders only when the
 * threshold is crossed (rAF-throttled, passive listener) — not on every scroll event.
 */
export function useScrolledPast(threshold: number): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      setScrolled(window.scrollY > threshold);
    };
    const onScroll = () => {
      if (frame === 0) {
        frame = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [threshold]);

  return scrolled;
}
