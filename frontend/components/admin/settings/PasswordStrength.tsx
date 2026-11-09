"use client";

import { Box, Group, List, Text, VisuallyHidden, type MantineColor } from "@mantine/core";
import { IconCheck, IconX } from "@tabler/icons-react";
import { MeterBar } from "../MeterBar";

export const MIN_STAFF_PASSWORD = 12;
export const MAX_PASSWORD_BYTES = 72;

/** UTF-8 byte length (bcrypt only reads the first 72 bytes; the API rejects longer passwords). */
export function passwordBytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

interface Requirement {
  label: string;
  met: (value: string) => boolean;
}

const REQUIREMENTS: readonly Requirement[] = [
  { label: `At least ${MIN_STAFF_PASSWORD} characters`, met: (value) => value.length >= MIN_STAFF_PASSWORD },
  { label: "Upper- and lower-case letters", met: (value) => /[a-z]/.test(value) && /[A-Z]/.test(value) },
  { label: "A number", met: (value) => /\d/.test(value) },
  { label: "A symbol (e.g. ! @ # %)", met: (value) => /[^A-Za-z0-9]/.test(value) },
];

interface Strength {
  /** 0–4. */
  score: number;
  label: string;
  color: MantineColor;
}

export function passwordStrength(value: string): Strength {
  if (value.length === 0) {
    return { score: 0, label: "Not set", color: "gray.4" };
  }
  const met = REQUIREMENTS.filter((requirement) => requirement.met(value)).length;
  // Length dominates: a short password is weak whatever it contains.
  const score = value.length < MIN_STAFF_PASSWORD ? Math.min(1, met) : Math.min(4, met + (value.length >= 16 ? 1 : 0));
  if (score <= 1) {
    return { score: Math.max(score, 1), label: "Weak", color: "danger.6" };
  }
  if (score === 2) {
    return { score, label: "Fair", color: "warning.6" };
  }
  if (score === 3) {
    return { score, label: "Good", color: "info.5" };
  }
  return { score, label: "Strong", color: "success.6" };
}

/** Strength bar (scaled with transform) plus the checklist the API and good practice expect. */
export function PasswordStrength({ value, id }: { value: string; id?: string }) {
  const strength = passwordStrength(value);
  return (
    <Box id={id} mt={6}>
      <Group justify="space-between" mb={4}>
        <Text size="xs" c="var(--mo-color-text-muted)">
          Password strength
        </Text>
        <Text size="xs" fw={600} c="var(--mo-color-text-strong)" aria-live="polite">
          {strength.label}
        </Text>
      </Group>
      <MeterBar ratio={strength.score / 4} color={strength.color} height={6} />
      <List spacing={2} size="xs" mt={8} center listStyleType="none" p={0}>
        {REQUIREMENTS.map((requirement) => {
          const met = requirement.met(value);
          return (
            <List.Item
              key={requirement.label}
              icon={
                <Box component="span" display="inline-flex" c={met ? "var(--mo-color-success-8)" : "var(--mo-color-text-subtle)"} aria-hidden>
                  {met ? <IconCheck size={13} stroke={2.4} /> : <IconX size={13} stroke={2.2} />}
                </Box>
              }
            >
              <Text span size="xs" c={met ? "var(--mo-color-text-strong)" : "var(--mo-color-text-muted)"}>
                {requirement.label}
                <VisuallyHidden>{met ? " (done)" : " (missing)"}</VisuallyHidden>
              </Text>
            </List.Item>
          );
        })}
      </List>
    </Box>
  );
}

const PASSWORD_SETS = {
  lower: "abcdefghijkmnpqrstuvwxyz",
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  digit: "23456789",
  symbol: "!@#$%&*?-_+=",
} as const;

/** A random 16-character password with every character class (no look-alike characters). */
export function generatePassword(length = 16): string {
  const all = Object.values(PASSWORD_SETS).join("");
  const random = (max: number): number => {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) % max;
  };
  const pick = (set: string): string => set.charAt(random(set.length));
  const chars = [pick(PASSWORD_SETS.lower), pick(PASSWORD_SETS.upper), pick(PASSWORD_SETS.digit), pick(PASSWORD_SETS.symbol)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    const current = chars[index] ?? "";
    chars[index] = chars[swap] ?? "";
    chars[swap] = current;
  }
  return chars.join("");
}
