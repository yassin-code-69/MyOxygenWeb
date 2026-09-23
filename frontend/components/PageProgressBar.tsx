"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Top glowing page-to-page progress bar indicator in primary brand pink (#FF6B8B).
 * Triggers smoothly on Next.js route transitions.
 */
export function PageProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // When route changes, animate progress bar to 100% and fade out
    setProgress(30);
    setVisible(true);

    const timer1 = setTimeout(() => {
      setProgress(75);
    }, 100);

    const timer2 = setTimeout(() => {
      setProgress(100);
    }, 300);

    const timer3 = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 600);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [pathname, searchParams]);

  if (!visible && progress === 0) return null;

  return (
    <div className="myoxygen-progress-bar-container" aria-hidden="true">
      <div
        className="myoxygen-progress-bar"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
        }}
      />
    </div>
  );
}
