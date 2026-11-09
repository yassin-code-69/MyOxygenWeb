"use client";

import { useEffect, type ReactNode } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { pageTransition } from "../lib/animations";

/**
 * True once the app has hydrated. The first (server-rendered) page is shown
 * immediately — no opacity-0 start, so LCP is never delayed — and only
 * subsequent client-side navigations animate in.
 */
let hasHydrated = false;

export interface PageTransitionProps
  extends Omit<HTMLMotionProps<"div">, "initial" | "animate" | "exit" | "variants" | "children"> {
  children?: ReactNode;
}

/**
 * Route-level enter transition built on the `pageTransition` variant.
 *
 * Recommended usage — `app/template.tsx` (re-mounts on every navigation):
 * ```tsx
 * export default function Template({ children }: { children: React.ReactNode }) {
 *   return <PageTransition>{children}</PageTransition>;
 * }
 * ```
 * Reduced motion: the root `MotionConfig reducedMotion="user"` drops the `y` offset.
 */
export function PageTransition({ children, ...props }: PageTransitionProps) {
  const animateOnMount = hasHydrated;

  useEffect(() => {
    hasHydrated = true;
  }, []);

  return (
    <motion.div
      variants={pageTransition}
      initial={animateOnMount ? "initial" : false}
      animate="animate"
      {...props}
    >
      {children}
    </motion.div>
  );
}
