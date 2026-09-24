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
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "300px 0px" }}
      transition={{
        duration: 0.4,
        delay,
        ease: "easeOut",
      }}
      className={className}
      style={{
        ...style,
      }}
      {...props}
    >
      {children}
    </motion.section>
  );
}
