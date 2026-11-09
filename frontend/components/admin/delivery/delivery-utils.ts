import type { MantineColor } from "@mantine/core";
import type { AdminParcelStatus } from "../../../types/admin";
import { formatCount } from "../format";

/** `"steadfast"` → `"Steadfast"`, `"unknown"` / null → `"No courier"`. */
export function courierLabel(provider: string | null | undefined): string {
  if (!provider || provider.toLowerCase() === "unknown") {
    return "No courier";
  }
  if (provider.toLowerCase() === "mock") {
    return "Mock courier (test)";
  }
  return provider.charAt(0).toUpperCase() + provider.slice(1).toLowerCase();
}

interface ParcelStatusStyle {
  label: string;
  color: MantineColor;
}

/** Courier-reported parcel states, in words a shop owner uses. */
export const PARCEL_STATUS: Record<AdminParcelStatus, ParcelStatusStyle> = {
  PENDING: { label: "Booked, awaiting pickup", color: "gray" },
  IN_TRANSIT: { label: "In transit", color: "accentPurple" },
  OUT_FOR_DELIVERY: { label: "Out for delivery", color: "info" },
  ON_HOLD: { label: "On hold", color: "warning" },
  APPROVAL_PENDING: { label: "Awaiting courier approval", color: "warning" },
  DELIVERED: { label: "Delivered", color: "success" },
  PARTIALLY_DELIVERED: { label: "Partly delivered", color: "warning" },
  RETURNED: { label: "Returned to sender", color: "danger" },
  CANCELLED: { label: "Cancelled", color: "danger" },
  UNKNOWN: { label: "No update from courier yet", color: "gray" },
};

/** `40.6` → `"1.7 days"`; under a day → `"5.5 hrs"`; `null` → `"—"`. */
export function formatDeliveryHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return "—";
  }
  if (hours < 24) {
    return `${Number(hours.toFixed(1))} hrs`;
  }
  return `${Number((hours / 24).toFixed(1))} days`;
}

/** Whole days between two timestamps (`null` when either is missing). */
export function daysBetween(from: string | null | undefined, to: string | Date | null | undefined): number | null {
  if (!from || !to) {
    return null;
  }
  const start = new Date(from).getTime();
  const end = (to instanceof Date ? to : new Date(to)).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.max(0, Math.floor((end - start) / 86_400_000));
}

/** `0` → "< 1 day", `1` → "1 day", `n` → "n days". */
export function formatDayCount(days: number): string {
  if (days === 0) {
    return "< 1 day";
  }
  return days === 1 ? "1 day" : `${formatCount(days)} days`;
}
