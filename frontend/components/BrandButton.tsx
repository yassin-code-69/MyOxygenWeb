"use client";

import React, { forwardRef } from "react";
import { Button, type ButtonProps, type MantineRadius } from "@mantine/core";
import { motion } from "motion/react";
import { brandGradients, myOxygenColors } from "../tokens";

export type BrandButtonVariant = "primary" | "secondary" | "accent" | "ghost";

export interface BrandButtonProps
  extends Omit<ButtonProps, "variant" | "color">,
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "color" | "style"> {
  variant?: BrandButtonVariant;
  radius?: MantineRadius;
  children: React.ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  style?: React.CSSProperties;
  component?: any;
  href?: string;
}

const variantStyles: Record<
  BrandButtonVariant,
  {
    background: string;
    color: string;
    boxShadow: string;
    border: string;
  }
> = {
  primary: {
    background: brandGradients.primary,
    color: "#FFFFFF",
    boxShadow: "0 4px 14px rgba(255, 107, 139, 0.35)",
    border: "none",
  },
  secondary: {
    background: brandGradients.secondary,
    color: "#FFFFFF",
    boxShadow: "0 4px 14px rgba(76, 175, 125, 0.25)",
    border: "none",
  },
  accent: {
    background: myOxygenColors.accentPurple,
    color: "#FFFFFF",
    boxShadow: "0 4px 14px rgba(167, 139, 250, 0.3)",
    border: "none",
  },
  ghost: {
    background: "transparent",
    color: myOxygenColors.darkText,
    boxShadow: "none",
    border: "1px solid #E5E7EB",
  },
};

export const BrandButton = forwardRef<HTMLButtonElement, BrandButtonProps>(
  (
    {
      variant = "primary",
      radius = "xl",
      size = "md",
      fullWidth = false,
      disabled = false,
      loading = false,
      children,
      style,
      onClick,
      ...others
    },
    ref
  ) => {
    const selectedStyle = variantStyles[variant];

    return (
      <motion.div
        whileTap={disabled || loading ? undefined : { scale: 0.97 }}
        transition={{ duration: 0.1, ease: "easeInOut" }}
        style={{
          display: fullWidth ? "block" : "inline-block",
          width: fullWidth ? "100%" : "auto",
        }}
      >
        <Button
          ref={ref}
          radius={radius}
          size={size}
          fullWidth={fullWidth}
          disabled={disabled}
          loading={loading}
          onClick={onClick}
          fw={650}
          style={{
            ...selectedStyle,
            transition: "all 0.2s ease",
            ...style,
          }}
          {...others}
        >
          {children}
        </Button>
      </motion.div>
    );
  }
);

BrandButton.displayName = "BrandButton";
