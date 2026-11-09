import { Avatar, type MantineColor } from "@mantine/core";
import { initialsOf } from "../format";

const AVATAR_COLORS: readonly MantineColor[] = ["secondaryGreen", "accentPurple", "info", "warning", "primaryPink"];

/** Stable color per person (same name → same color on every page). */
export function avatarColor(seed: string): MantineColor {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? "secondaryGreen";
}

export interface CustomerAvatarProps {
  name: string;
  /** Seed for the color (defaults to the name). */
  seed?: string;
  size?: number;
}

/** Initials avatar (no photos are stored for people). Decorative: the name is always shown beside it. */
export function CustomerAvatar({ name, seed, size = 36 }: CustomerAvatarProps) {
  return (
    <Avatar size={size} radius="xl" variant="light" color={avatarColor(seed ?? name)} aria-hidden>
      {initialsOf(name)}
    </Avatar>
  );
}
