"use client";

import type { ReactNode } from "react";
import type { MantineColor } from "@mantine/core";
import { KpiCard as KitKpiCard } from "./kit/KpiCard";
import { toneFromColor } from "./kit/tones";

export interface KpiCardProps {
  label: string;
  /** Pre-formatted value. */
  value: ReactNode;
  icon: ReactNode;
  /** Mapped onto the closest pastel tone (pink → rose, info → sky, …). */
  color?: MantineColor;
  /** Supporting line under the value. */
  hint?: ReactNode;
  /** Badge next to the value (e.g. a trend). Omit when there is no real data. */
  badge?: ReactNode;
  /** Optional drill-down link. */
  href?: string;
  linkLabel?: string;
  loading?: boolean;
}

/**
 * Legacy metric tile API (kept for existing pages) rendered with the new
 * pastel kit card. New code should import `KpiCard` from `./kit`.
 */
export function KpiCard({ label, value, icon, color = "primaryPink", hint, badge, href, linkLabel = "View", loading = false }: KpiCardProps) {
  return (
    <KitKpiCard
      label={label}
      value={value}
      icon={icon}
      tone={toneFromColor(color)}
      hint={hint}
      badge={badge}
      href={href}
      linkLabel={linkLabel}
      loading={loading}
    />
  );
}
