/**
 * Motion presets (`motion/react`). Hardware-accelerated properties only:
 * `opacity`, `x`, `y`, `scale`, `rotate` — never width/height/top/margin/padding.
 *
 * Reduced motion: the root `<MotionConfig reducedMotion="user">` (components/AppProviders)
 * automatically drops transform animations for users who prefer reduced motion,
 * leaving opacity fades — so these presets are safe by default.
 */
import type { TargetAndTransition, Transition, Variants } from "motion/react";
import { durations, easings, motionDistances, springs } from "../tokens/motion";

const seconds = (ms: number) => ms / 1000;

/** Standard transitions. */
export const transitions = {
  easeOut: { duration: seconds(durations.moderate), ease: easings.out } as Transition,
  easeInOut: { duration: seconds(durations.base), ease: easings.inOut } as Transition,
  quick: { duration: seconds(durations.fast), ease: easings.out } as Transition,
  gentleSpring: springs.gentle as Transition,
  snappySpring: springs.snappy as Transition,
  bouncySpring: springs.bouncy as Transition,
};

export type RevealDirection = "up" | "down" | "left" | "right" | "none";

/** Initial offset for a directional reveal (`up` = content rises into place). */
export function revealOffset(
  direction: RevealDirection,
  distance: number = motionDistances.reveal
): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: distance };
    case "down":
      return { x: 0, y: -distance };
    case "left":
      return { x: distance, y: 0 };
    case "right":
      return { x: -distance, y: 0 };
    default:
      return { x: 0, y: 0 };
  }
}

/** Directional spring reveal used by `AnimatedSection`. */
export function revealVariants(
  direction: RevealDirection = "up",
  { delay = 0, distance = motionDistances.reveal }: { delay?: number; distance?: number } = {}
): Variants {
  const offset = revealOffset(direction, distance);
  return {
    hidden: { opacity: 0, ...offset },
    visible: {
      opacity: 1,
      x: 0,
      y: 0,
      transition: {
        ...springs.gentle,
        delay,
        opacity: { duration: seconds(durations.slow), ease: easings.out, delay },
      },
    },
  };
}

/** Fade + rise. */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 16 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: seconds(durations.moderate), ease: easings.out },
  },
  exit: {
    opacity: 0,
    y: 12,
    transition: { duration: seconds(durations.base), ease: easings.in },
  },
};

/** Staggered children orchestration. */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.04 },
  },
  exit: {
    transition: { staggerChildren: 0.03, staggerDirection: -1 },
  },
};

/** Card elevation on hover. */
export const cardHover: Variants = {
  initial: { y: 0 },
  hover: { y: -motionDistances.lift, transition: springs.snappy },
};

/** Props helper for card hover. */
export const cardHoverProps: { whileHover: TargetAndTransition } = {
  whileHover: { y: -motionDistances.lift, transition: springs.snappy },
};

/** Tactile compression on tap. */
export const tapBounce: Variants = {
  rest: { scale: 1 },
  tap: { scale: 0.97, transition: { duration: seconds(durations.instant), ease: easings.inOut } },
};

/** Props helper for tap compression. */
export const tapBounceProps: { whileTap: TargetAndTransition } = {
  whileTap: { scale: 0.97 },
};

/** Subtle repeating pulse for urgency badges / timers (disabled under reduced motion). */
export const pulseAttention: Variants = {
  initial: { scale: 1 },
  animate: {
    scale: [1, 1.04, 1],
    transition: { repeat: Infinity, duration: 2, ease: "easeInOut" },
  },
};

/** Spring pop-in for pills & badges. */
export const pillBounce: Variants = {
  initial: { scale: 0.85, opacity: 0 },
  animate: { scale: 1, opacity: 1, transition: springs.bouncy },
  tap: { scale: 0.95 },
};

/** Page-level route transition (used by `PageTransition`). */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: motionDistances.page },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: seconds(durations.moderate), ease: easings.out },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: { duration: seconds(durations.fast), ease: easings.in },
  },
};
