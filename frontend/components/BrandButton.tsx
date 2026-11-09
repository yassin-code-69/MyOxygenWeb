"use client";

import { forwardRef } from "react";
import { Button, createPolymorphicComponent, type ButtonProps } from "@mantine/core";
import { mantineGradients } from "../tokens";
import classes from "./BrandButton.module.css";

/**
 * - `primary`   pink gradient (#FF6B8B → #F472B6) — main CTAs
 * - `secondary` green → purple gradient — secondary CTAs ("Buy now")
 * - `accent`    filled purple — promotional actions
 * - `outline`   pink outline, AA pink label
 * - `ghost`     transparent, AA pink label, blush hover
 */
export type BrandButtonVariant = "primary" | "secondary" | "accent" | "outline" | "ghost";

export interface BrandButtonProps extends Omit<ButtonProps, "variant" | "color" | "gradient"> {
  variant?: BrandButtonVariant;
}

const variantProps: Record<BrandButtonVariant, Pick<ButtonProps, "variant" | "color" | "gradient">> = {
  primary: { variant: "gradient", gradient: mantineGradients.primary },
  secondary: { variant: "gradient", gradient: mantineGradients.secondary },
  accent: { variant: "filled", color: "accentPurple" },
  outline: { variant: "outline", color: "primaryPink" },
  ghost: { variant: "subtle", color: "primaryPink" },
};

const BrandButtonBase = forwardRef<HTMLButtonElement, BrandButtonProps>(
  ({ variant = "primary", radius = "xl", className, ...others }, ref) => (
    <Button
      ref={ref}
      radius={radius}
      {...variantProps[variant]}
      {...others}
      data-brand-variant={variant}
      className={className ? `${classes.root} ${className}` : classes.root}
    />
  )
);

BrandButtonBase.displayName = "BrandButton";

/**
 * Pill-shaped brand CTA built on Mantine `Button` (inherits `loading`, `leftSection`,
 * `fullWidth`, `size`, …). Polymorphic and fully typed:
 *
 * ```tsx
 * <BrandButton onClick={submit} loading={isSubmitting}>Place order</BrandButton>
 * <BrandButton component={Link} href="/products" variant="outline">Shop all</BrandButton>
 * ```
 */
export const BrandButton = createPolymorphicComponent<"button", BrandButtonProps>(BrandButtonBase);
