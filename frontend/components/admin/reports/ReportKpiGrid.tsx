"use client";

import { SimpleGrid, type SimpleGridProps } from "@mantine/core";
import { KpiCard, type KpiCardProps } from "../kit";
import classes from "./reports.module.css";

export interface ReportKpiItem extends KpiCardProps {
  key: string;
}

/** Container-width columns per card count (the sidebar takes 260px, so the viewport is a poor guide). */
const COLUMNS: Record<number, SimpleGridProps["cols"]> = {
  1: { base: 1 },
  2: { base: 1, "480px": 2 },
  3: { base: 1, "560px": 3 },
  4: { base: 2, "900px": 4 },
  5: { base: 2, "760px": 3, "1100px": 5 },
  6: { base: 2, "760px": 3, "1040px": 6 },
};

/**
 * A row of kit `KpiCard`s that adapts to the content width: 2 → 3 → all in
 * one row (three cards: 1 → 3). Five or six per row tighten the card (six
 * stack the icon above the text), and so do two per row on phones, so values
 * are never cut off.
 */
export function ReportKpiGrid({ items }: { items: readonly ReportKpiItem[] }) {
  const count = Math.min(Math.max(items.length, 1), 6);
  const density = [count === 6 ? classes.kpiSix : count === 5 ? classes.kpiFive : undefined, count >= 4 ? classes.kpiPhone : undefined]
    .filter(Boolean)
    .join(" ");
  return (
    <SimpleGrid type="container" cols={COLUMNS[count]} spacing="md" verticalSpacing="md">
      {items.map(({ key, className, ...card }) => (
        <KpiCard key={key} {...card} className={[density, className].filter(Boolean).join(" ") || undefined} />
      ))}
    </SimpleGrid>
  );
}
