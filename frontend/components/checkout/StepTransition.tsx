"use client";

import type { ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import { durations, easings } from "../../tokens/motion";

const SLIDE_DISTANCE = 48;

/** `direction` 1 = forward (enter from the right), -1 = back (enter from the left). */
function slideVariants(distance: number): Variants {
  return {
    enter: (direction: number) => ({ x: direction * distance, opacity: 0 }),
    center: {
      x: 0,
      opacity: 1,
      transition: { duration: durations.moderate / 1000, ease: easings.out },
    },
    exit: (direction: number) => ({
      x: direction * -distance,
      opacity: 0,
      transition: { duration: durations.base / 1000, ease: easings.in },
    }),
  };
}

export interface StepTransitionProps {
  stepKey: string | number;
  direction: 1 | -1;
  children: ReactNode;
}

/**
 * Directional slide between checkout steps (transform + opacity only).
 * Under reduced motion the content only cross-fades.
 */
export function StepTransition({ stepKey, direction, children }: StepTransitionProps) {
  const reduceMotion = useReducedMotion();
  const variants = slideVariants(reduceMotion ? 0 : SLIDE_DISTANCE);

  return (
    // Clip the horizontal slide without cutting off input focus rings.
    <div style={{ overflow: "hidden", margin: -6, padding: 6 }}>
      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={stepKey} custom={direction} variants={variants} initial="enter" animate="center" exit="exit">
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
