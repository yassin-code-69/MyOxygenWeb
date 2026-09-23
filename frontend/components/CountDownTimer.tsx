"use client";

import React, { useState, useEffect } from "react";
import { Box, Group, Text } from "@mantine/core";
import { myOxygenColors } from "../tokens";

export interface CountDownTimerProps {
  endsAt: Date | string;
  onExpire?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

interface TimeRemaining {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

function calculateTimeRemaining(targetDate: Date): TimeRemaining {
  const now = Date.now();
  const diff = targetDate.getTime() - now;

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, isExpired: true };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return { hours, minutes, seconds, isExpired: false };
}

export function CountDownTimer({ endsAt, onExpire, className, style }: CountDownTimerProps) {
  const [mounted, setMounted] = useState(false);
  const targetDate = typeof endsAt === "string" ? new Date(endsAt) : endsAt;

  const [timeLeft, setTimeLeft] = useState<TimeRemaining>(() =>
    calculateTimeRemaining(targetDate)
  );

  useEffect(() => {
    setMounted(true);
    const target = typeof endsAt === "string" ? new Date(endsAt) : endsAt;

    const tick = () => {
      const remaining = calculateTimeRemaining(target);
      setTimeLeft(remaining);
      if (remaining.isExpired && onExpire) {
        onExpire();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [endsAt, onExpire]);

  const pad = (n: number) => String(n).padStart(2, "0");

  const timeBlocks = [
    { label: "Hours", value: mounted ? pad(timeLeft.hours) : "00" },
    { label: "Mins", value: mounted ? pad(timeLeft.minutes) : "00" },
    { label: "Secs", value: mounted ? pad(timeLeft.seconds) : "00" },
  ];

  return (
    <Group gap={8} align="center" className={className} style={style}>
      {timeBlocks.map((block, idx) => (
        <React.Fragment key={block.label}>
          <Box
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 48,
              padding: "4px 8px",
              backgroundColor: myOxygenColors.creamBackground,
              border: `1.5px solid ${myOxygenColors.primaryPink}`,
              borderRadius: "8px",
              boxShadow: "0 2px 6px rgba(255, 107, 139, 0.15)",
            }}
          >
            <Text
              fw={800}
              size="md"
              c={myOxygenColors.primaryPink}
              style={{
                lineHeight: 1.1,
                fontFamily: "var(--font-poppins)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {block.value}
            </Text>
            <Text
              size="9px"
              fw={700}
              c={myOxygenColors.textGray}
              style={{
                textTransform: "uppercase",
                letterSpacing: "0.5px",
                marginTop: 2,
              }}
            >
              {block.label}
            </Text>
          </Box>

          {idx < timeBlocks.length - 1 && (
            <Text
              fw={800}
              size="md"
              c={myOxygenColors.primaryPink}
              style={{ lineHeight: 1 }}
            >
              :
            </Text>
          )}
        </React.Fragment>
      ))}
    </Group>
  );
}
