/**
 * Motion tokens. Only `transform` and `opacity` may be animated (RULES §2).
 * `lib/animations.ts` builds Motion variants from these values, and the same
 * durations/easings are exposed to CSS as `--mo-duration-*` / `--mo-ease-*`.
 */
export const durations = {
  instant: 100,
  fast: 150,
  base: 200,
  moderate: 300,
  slow: 450,
} as const;

/** Cubic-bezier control points (Motion accepts the tuple form). */
export const easings = {
  /** Decelerate — entering elements. */
  out: [0.25, 1, 0.5, 1],
  /** Accelerate — exiting elements. */
  in: [0.5, 0, 0.75, 0],
  /** Standard — state changes. */
  inOut: [0.65, 0, 0.35, 1],
} as const;

export type EasingName = keyof typeof easings;

/** CSS `cubic-bezier()` string for an easing token. */
export function cssEasing(name: EasingName): string {
  return `cubic-bezier(${easings[name].join(", ")})`;
}

/** Spring presets (stiffness / damping / mass). */
export const springs = {
  /** Section reveals — soft settle, no visible overshoot. */
  gentle: { type: "spring", stiffness: 170, damping: 26, mass: 1 },
  /** UI feedback (buttons, toggles). */
  snappy: { type: "spring", stiffness: 400, damping: 30, mass: 0.8 },
  /** Pills / badges popping in. */
  bouncy: { type: "spring", stiffness: 450, damping: 18, mass: 0.9 },
} as const;

/** Distances (px) used by directional reveals. */
export const motionDistances = {
  reveal: 24,
  page: 12,
  lift: 4,
} as const;
