"use client";

import React from "react";
import { motion, type HTMLMotionProps } from "motion/react";

interface AnimatedSectionProps extends HTMLMotionProps<"section"> {
  children: React.ReactNode;
  delay?: number;
  direction?: "up" | "down" | "left" | "right" | "none";
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedSection({
  children,
  delay = 0,
  direction = "up",
  className,
  style,
  ...props
}: AnimatedSectionProps) {
  const getInitialOffset = () => {
    switch (direction) {
      case "up":
        return { y: 28, x: 0 };
      case "down":
        return { y: -28, x: 0 };
      case "left":
        return { x: 30, y: 0 };
      case "right":
        return { x: -30, y: 0 };
      case "none":
      default:
        return { x: 0, y: 0 };
    }
  };

  const initialOffset = getInitialOffset();

  return (
    <motion.section
      initial={{ opacity: 0, ...initialOffset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{
        duration: 0.5,
        delay,
        ease: [0.22, 1, 0.36, 1], // easeOutCubic
      }}
      className={className}
      style={{
        willChange: "opacity, transform",
        ...style,
      }}
      {...props}
    >
      {children}
    </motion.section>
  );
}
