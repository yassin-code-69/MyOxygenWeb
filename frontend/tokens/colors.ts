export const myOxygenColors = {
  // Brand Core
  primaryPink: "#FF6B8B", // Buttons, highlights, primary CTAs
  primaryPinkHover: "#F472B6", // Button hover state
  primaryPinkActive: "#E11D48", // Button active state
  secondaryGreen: "#4CAF7D", // Trust badges, headers, icons
  accentPurple: "#A78BFA", // Category accents, hover badges

  // Canvas & Surfaces
  creamBackground: "#FFF8F6", // Global page canvas
  surfaceWhite: "#FFFFFF", // Elevated cards & modals

  // Typography
  darkText: "#1F2937", // Headings, titles, high contrast
  textGray: "#6B7280", // Body text, placeholders, muted labels

  // Status & Feedback
  success: "#10B981", // Confirmations, active stock
  warning: "#F59E0B", // Expiring alerts, low stock
  error: "#EF4444", // Form errors, critical alerts
} as const;

export type MyOxygenColorKey = keyof typeof myOxygenColors;
