import Link from "next/link";
import { Box } from "@mantine/core";
import { ImageWithFallback } from "../ImageWithFallback";
import classes from "./AdminShell.module.css";

export interface AdminBrandProps {
  /** Where the logo links (the user's landing page). */
  href: string;
  onNavigate?: () => void;
  /** Heart mark only (narrow headers). */
  compact?: boolean;
}

/** Heart logo + "My Oxygen" wordmark + tagline, linking to the back-office home. */
export function AdminBrand({ href, onNavigate, compact = false }: AdminBrandProps) {
  return (
    <Link href={href} onClick={onNavigate} className={classes.brand} aria-label="My Oxygen back-office home">
      <ImageWithFallback src="/icons/logo-heart.svg" alt="" width={compact ? 34 : 40} height={compact ? 34 : 40} loading="eager" />
      {compact ? null : (
        <Box>
          <div className={classes.brandName}>My Oxygen</div>
          <div className={classes.brandTagline}>Healthy Life • Happy You</div>
        </Box>
      )}
    </Link>
  );
}
