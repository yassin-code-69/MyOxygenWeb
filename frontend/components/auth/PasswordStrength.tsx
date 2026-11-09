"use client";

import { Box, Group, List, Stack, Text, ThemeIcon, VisuallyHidden, type MantineColor } from "@mantine/core";
import { IconCheck, IconMinus } from "@tabler/icons-react";
import { semantic } from "../../tokens";
import { PASSWORD_MIN } from "./auth-schemas";

interface StrengthCheck {
  label: string;
  test: (value: string) => boolean;
}

const CHECKS: readonly StrengthCheck[] = [
  { label: `At least ${PASSWORD_MIN} characters (required)`, test: (value) => value.length >= PASSWORD_MIN },
  { label: "Upper- and lower-case letters", test: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: "At least one number", test: (value) => /\d/.test(value) },
  { label: "A symbol, e.g. ! @ # ?", test: (value) => /[^A-Za-z0-9]/.test(value) },
];

const LEVELS: readonly { label: string; color: MantineColor }[] = [
  { label: "Too short", color: "danger" },
  { label: "Weak", color: "danger" },
  { label: "Fair", color: "warning" },
  { label: "Good", color: "info" },
  { label: "Strong", color: "success" },
];

/** 0–4. Length below the minimum always scores 0. */
export function passwordScore(value: string): number {
  if (value.length < PASSWORD_MIN) {
    return 0;
  }
  const passed = CHECKS.filter((check) => check.test(value)).length;
  return Math.min(4, passed + (value.length >= 12 ? 1 : 0));
}

export interface PasswordStrengthProps {
  value: string;
  id?: string;
}

/** Strength meter + checklist (a hint only: the API requires 8–72 characters). */
export function PasswordStrength({ value, id }: PasswordStrengthProps) {
  const score = passwordScore(value);
  const level = LEVELS[score] ?? LEVELS[0];

  return (
    <Stack gap={8} id={id}>
      <Group gap={6} wrap="nowrap" aria-hidden>
        {[1, 2, 3, 4].map((segment) => (
          <Box
            key={segment}
            h={4}
            style={{
              flex: 1,
              borderRadius: "var(--mantine-radius-xl)",
              backgroundColor:
                score >= segment ? `var(--mantine-color-${level.color}-6)` : semantic.borderSubtle,
            }}
          />
        ))}
      </Group>
      <Text size="xs" c={semantic.textSecondary} aria-live="polite">
        Password strength:{" "}
        <Text component="span" inherit fw={700} c={`${level.color}.8`}>
          {level.label}
        </Text>
      </Text>
      <List size="xs" spacing={4} center>
        {CHECKS.map((check) => {
          const met = check.test(value);
          return (
            <List.Item
              key={check.label}
              icon={
                <ThemeIcon size={16} radius="xl" variant="light" color={met ? "success" : "gray"} aria-hidden>
                  {met ? <IconCheck size={11} /> : <IconMinus size={11} />}
                </ThemeIcon>
              }
            >
              <Text size="xs" c={met ? semantic.textSuccess : semantic.textMuted}>
                {check.label}
                <VisuallyHidden>{met ? " — done" : " — not yet"}</VisuallyHidden>
              </Text>
            </List.Item>
          );
        })}
      </List>
    </Stack>
  );
}
