"use client";

import type { ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { revealVariants, type RevealDirection } from "../lib/animations";

export interface AnimatedSectionProps
  extends Omit<
    HTMLMotionProps<"section">,
    "initial" | "animate" | "whileInView" | "variants" | "viewport" | "transition" | "children"
  > {
  children?: ReactNode;
  /** Delay (seconds) before the reveal starts. */
  delay?: number;
  /** Direction the content travels *from* (`up` = rises into place). */
  direction?: RevealDirection;
  /** Travel distance in px. Default 24. */
  distance?: number;
  /**
   * Above-the-fold content (hero, first product row): rendered fully visible on the
   * first paint with no entrance animation, so it never delays LCP.
   */
  priority?: boolean;
  /** Alias of `priority`. */
  immediate?: boolean;
  /** Reveal only the first time it scrolls into view. Default `true`. */
  once?: boolean;
  /** Fraction of the section that must be visible before revealing. Default `0.15`. */
  amount?: number;
}

/**
 * Viewport-triggered reveal with spring physics (`motion/react`).
 * Animates only `opacity` + `transform`. Users with `prefers-reduced-motion` get an
 * opacity-only fade (the root `MotionConfig reducedMotion="user"` strips transforms).
 */
export function AnimatedSection({
  children,
  delay = 0,
  direction = "up",
  distance,
  priority = false,
  immediate = false,
  once = true,
  amount = 0.15,
  ...props
}: AnimatedSectionProps) {
  if (priority || immediate) {
    return <motion.section {...props}>{children}</motion.section>;
  }

  return (
    <motion.section
      variants={revealVariants(direction, { delay, distance })}
      initial="hidden"
      whileInView="visible"
      viewport={{ once, amount }}
      {...props}
    >
      {children}
    </motion.section>
  );
}
