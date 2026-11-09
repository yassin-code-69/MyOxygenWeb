"use client";

import { useState, type SyntheticEvent } from "react";
import Image, { type ImageProps } from "next/image";
import { PLACEHOLDER_IMAGE, REMOTE_IMAGE_PATTERNS } from "../lib/image-config.mjs";

export interface ImageWithFallbackProps extends Omit<ImageProps, "src" | "alt"> {
  /** Image URL. Empty / null values render the fallback immediately. */
  src: string | null | undefined;
  /** Required: describe the image, or pass `""` for purely decorative images. */
  alt: string;
  /** Shown when `src` is missing or fails to load. Defaults to the brand placeholder. */
  fallbackSrc?: string;
}

function hostMatches(pattern: string, hostname: string): boolean {
  if (pattern.startsWith("*.")) {
    return hostname.endsWith(pattern.slice(1));
  }
  return pattern === hostname;
}

function pathMatches(pattern: string, pathname: string): boolean {
  if (pattern.endsWith("/**")) {
    return pathname.startsWith(pattern.slice(0, -2));
  }
  return pattern === pathname;
}

/**
 * Whether next/image may optimize this URL: local raster files and hosts listed in
 * `lib/image-config.mjs` (the same list as `images.remotePatterns`). Anything else
 * (unknown hosts, data/blob URLs, SVGs) is rendered with `unoptimized` instead of
 * throwing the "hostname is not configured" runtime error.
 */
export function isOptimizableImageSrc(src: string): boolean {
  const path = src.split("?", 1)[0] ?? "";
  if (path.toLowerCase().endsWith(".svg")) {
    return false;
  }
  if (src.startsWith("/") && !src.startsWith("//")) {
    return true;
  }
  try {
    const url = new URL(src);
    return REMOTE_IMAGE_PATTERNS.some(
      (pattern) =>
        url.protocol === `${pattern.protocol}:` &&
        hostMatches(pattern.hostname, url.hostname) &&
        pathMatches(pattern.pathname, url.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * `next/image` that never shows a broken image: missing or failing sources swap to
 * the brand placeholder (`/images/placeholder-product.svg`). A new `src` retries
 * automatically (state tracks which source failed rather than a boolean flag).
 */
export function ImageWithFallback({
  src,
  alt,
  fallbackSrc = PLACEHOLDER_IMAGE,
  unoptimized,
  onError,
  ...props
}: ImageWithFallbackProps) {
  const requested = src && src.trim() !== "" ? src : fallbackSrc;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const current = failedSrc === requested ? fallbackSrc : requested;

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    if (current !== fallbackSrc) {
      setFailedSrc(requested);
    }
    onError?.(event);
  };

  return (
    <Image
      {...props}
      src={current}
      alt={alt}
      unoptimized={unoptimized ?? !isOptimizableImageSrc(current)}
      onError={handleError}
    />
  );
}
