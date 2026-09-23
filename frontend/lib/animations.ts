import type { Variants, Transition, TargetAndTransition } from "motion/react";

/**
 * Standard spring and easing configurations for hardware-accelerated
 * (transform & opacity only) transitions.
 */
export const transitions = {
  easeOut: { duration: 0.35, ease: [0.25, 1, 0.5, 1] } as Transition,
  easeInOut: { duration: 0.2, ease: "easeInOut" } as Transition,
  quick: { duration: 0.15, ease: "easeOut" } as Transition,
  gentleSpring: { type: "spring", stiffness: 350, damping: 25 } as Transition,
  bouncySpring: { type: "spring", stiffness: 450, damping: 15 } as Transition,
};

/**
 * Smooth fade in and vertical slide up.
 */
export const fadeInUp: Variants = {
  initial: {
    opacity: 0,
    y: 16,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.35,
      ease: [0.25, 1, 0.5, 1],
    },
  },
  exit: {
    opacity: 0,
    y: 12,
    transition: {
      duration: 0.2,
      ease: "easeIn",
    },
  },
};

/**
 * Orchestrates staggered entry for child motion elements.
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.04,
      staggerDirection: -1,
    },
  },
};

/**
 * Subtle elevation on hover for cards and containers.
 */
export const cardHover: Variants = {
  initial: {
    y: 0,
  },
  hover: {
    y: -4,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
};

/**
 * Direct props helper for card hover.
 */
export const cardHoverProps: { whileHover: TargetAndTransition } = {
  whileHover: {
    y: -4,
    transition: {
      duration: 0.2,
      ease: "easeOut",
    },
  },
};

/**
 * Tactile micro-compression on tap/click.
 */
export const tapBounce: Variants = {
  rest: {
    scale: 1,
  },
  tap: {
    scale: 0.97,
    transition: {
      duration: 0.1,
      ease: "easeInOut",
    },
  },
};

/**
 * Direct props helper for tap micro-compression.
 */
export const tapBounceProps: { whileTap: TargetAndTransition } = {
  whileTap: {
    scale: 0.97,
  },
};

/**
 * Continuous subtle pulsing attention variant for urgency badges or timers.
 */
export const pulseAttention: Variants = {
  initial: {
    scale: 1,
  },
  animate: {
    scale: [1, 1.04, 1],
    transition: {
      repeat: Infinity,
      duration: 2,
      ease: "easeInOut",
    },
  },
};

/**
 * Spring-loaded bounce entry for pills and badges.
 */
export const pillBounce: Variants = {
  initial: {
    scale: 0.85,
    opacity: 0,
  },
  animate: {
    scale: 1,
    opacity: 1,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 22,
    },
  },
  tap: {
    scale: 0.95,
  },
};

/**
 * Smooth page-level route transition variant.
 */
export const pageTransition: Variants = {
  initial: {
    opacity: 0,
    y: 12,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: [0.25, 1, 0.5, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -8,
    transition: {
      duration: 0.18,
      ease: "easeIn",
    },
  },
};
