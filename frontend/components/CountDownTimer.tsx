"use client";

import { Fragment, useEffect, useRef, useState, type CSSProperties } from "react";
import { VisuallyHidden } from "@mantine/core";
import { IconClockHour4 } from "@tabler/icons-react";
import classes from "./CountDownTimer.module.css";

export interface CountDownTimerProps {
  /** Deadline as a Date, ISO string or epoch milliseconds. */
  endsAt: Date | string | number;
  /** Fired exactly once when the countdown reaches zero (also if already expired on mount). */
  onExpire?: () => void;
  /** `full` = boxed H/M/S blocks; `compact` = inline pill (`02:14:09`). */
  variant?: "full" | "compact";
  /** Screen-reader prefix for the live summary. */
  label?: string;
  /** Text shown once expired. */
  expiredLabel?: string;
  className?: string;
  style?: CSSProperties;
}

interface Remaining {
  totalMs: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function toTimestamp(value: Date | string | number): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function getRemaining(target: number, now: number): Remaining {
  const totalMs = Math.max(0, target - now);
  const totalSeconds = Math.ceil(totalMs / 1000);
  return {
    totalMs,
    days: Math.floor(totalSeconds / 86_400),
    hours: Math.floor((totalSeconds % 86_400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

const pad = (value: number) => String(value).padStart(2, "0");

function describe(remaining: Remaining): string {
  const parts: string[] = [];
  if (remaining.days > 0) {
    parts.push(`${remaining.days} day${remaining.days === 1 ? "" : "s"}`);
  }
  if (remaining.hours > 0) {
    parts.push(`${remaining.hours} hour${remaining.hours === 1 ? "" : "s"}`);
  }
  parts.push(`${remaining.minutes} minute${remaining.minutes === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/**
 * Flash-sale countdown.
 *
 * - Renders stable placeholders on the server (no hydration mismatch), ticks on the client.
 * - Ticks are aligned to whole seconds and computed from `Date.now()` (no drift).
 * - `onExpire` is read through a ref: changing the callback never restarts the timer,
 *   and it fires once per deadline.
 * - Digits are `aria-hidden`; a polite live region announces the remaining time once per
 *   minute (and on expiry) instead of every second.
 */
export function CountDownTimer({
  endsAt,
  onExpire,
  variant = "full",
  label = "Offer ends in",
  expiredLabel = "Offer ended",
  className,
  style,
}: CountDownTimerProps) {
  const target = toTimestamp(endsAt);
  const [now, setNow] = useState<number | null>(null);
  const onExpireRef = useRef(onExpire);
  const firedForRef = useRef<number | null>(null);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const current = Date.now();
      setNow(current);
      const remainingMs = target - current;

      if (remainingMs <= 0) {
        if (firedForRef.current !== target) {
          firedForRef.current = target;
          onExpireRef.current?.();
        }
        return;
      }

      // Wake up right after the next whole-second boundary of the remaining time.
      timeout = setTimeout(tick, (remainingMs % 1000 || 1000) + 16);
    };

    tick();
    return () => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };
  }, [target]);

  const remaining = now === null ? null : getRemaining(target, now);
  const expired = remaining !== null && remaining.totalMs <= 0;
  const announcement =
    remaining === null ? "" : expired ? expiredLabel : `${label} ${describe(remaining)}`;

  const rootClass = [variant === "compact" ? classes.compact : classes.full, expired ? classes.expired : "", className]
    .filter(Boolean)
    .join(" ");

  const liveRegion = (
    <VisuallyHidden aria-live="polite" aria-atomic="true">
      {/* Only minute-level changes alter this string, so announcements stay infrequent. */}
      {announcement}
    </VisuallyHidden>
  );

  if (variant === "compact") {
    const hours = remaining ? remaining.days * 24 + remaining.hours : null;
    return (
      <span role="timer" className={rootClass} style={style}>
        <IconClockHour4 size={14} stroke={2} aria-hidden />
        <span aria-hidden>
          {expired
            ? expiredLabel
            : remaining && hours !== null
              ? `${pad(hours)}:${pad(remaining.minutes)}:${pad(remaining.seconds)}`
              : "--:--:--"}
        </span>
        {liveRegion}
      </span>
    );
  }

  const blocks = [
    ...(remaining && remaining.days > 0 ? [{ unit: "Days", value: pad(remaining.days) }] : []),
    { unit: "Hours", value: remaining ? pad(remaining.hours) : "--" },
    { unit: "Mins", value: remaining ? pad(remaining.minutes) : "--" },
    { unit: "Secs", value: remaining ? pad(remaining.seconds) : "--" },
  ];

  return (
    <div role="timer" className={rootClass} style={style}>
      {blocks.map((block, index) => (
        <Fragment key={block.unit}>
          <div className={classes.block} aria-hidden>
            <span className={classes.value}>{block.value}</span>
            <span className={classes.unit}>{block.unit}</span>
          </div>
          {index < blocks.length - 1 ? (
            <span className={classes.separator} aria-hidden>
              :
            </span>
          ) : null}
        </Fragment>
      ))}
      {liveRegion}
    </div>
  );
}
