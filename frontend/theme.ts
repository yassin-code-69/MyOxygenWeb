"use client";

import { createTheme, MantineColorsTuple, Skeleton, TextInput, Select, Card, Paper } from "@mantine/core";
import { myOxygenColors, typography } from "./tokens";

const primaryPinkSwatch: MantineColorsTuple = [
  "#fff0f3",
  "#ffe3e8",
  "#ffc7d2",
  "#ffa8ba",
  "#ff8fa4",
  "#ff6b8b", // Index 5 - Primary Pink
  "#f45b7e",
  "#e04267",
  "#c82e52",
  "#ad193f",
];

const secondaryGreenSwatch: MantineColorsTuple = [
  "#edfbf3",
  "#d8f6e4",
  "#afedc8",
  "#82e4aa",
  "#5ddc90",
  "#4caf7d", // Index 5 - Secondary Green
  "#399967",
  "#2c7a52",
  "#205b3d",
  "#143d28",
];

export const theme = createTheme({
  colors: {
    primaryPink: primaryPinkSwatch,
    secondaryGreen: secondaryGreenSwatch,
  },
  primaryColor: "primaryPink",
  fontFamily: typography.fontFamilyBody,
  headings: {
    fontFamily: typography.fontFamilyHeadings,
  },
  defaultRadius: "md",
  components: {
    Skeleton: Skeleton.extend({
      defaultProps: {
        radius: "md",
      },
      styles: {
        root: {
          backgroundColor: "#FDE8EC",
        },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: {
        radius: "md",
      },
      styles: {
        input: {
          backgroundColor: "#FFFFFF",
          borderColor: "#FBCFE8",
          color: "#1F2937",
        },
      },
    }),
    Select: Select.extend({
      defaultProps: {
        radius: "md",
      },
      styles: {
        input: {
          backgroundColor: "#FFFFFF",
          borderColor: "#FBCFE8",
          color: "#1F2937",
        },
        dropdown: {
          backgroundColor: "#FFFFFF",
          borderColor: "#FFE4EC",
        },
      },
    }),
    Card: Card.extend({
      defaultProps: {
        radius: "lg",
      },
      styles: {
        root: {
          backgroundColor: "#FFFFFF",
          borderColor: "#FFE4EC",
        },
      },
    }),
    Paper: Paper.extend({
      defaultProps: {
        radius: "md",
      },
      styles: {
        root: {
          backgroundColor: "#FFFFFF",
          borderColor: "#FFE4EC",
        },
      },
    }),
  },
  other: {
    creamBackground: myOxygenColors.creamBackground,
    accentPurple: myOxygenColors.accentPurple,
    darkText: myOxygenColors.darkText,
    textGray: myOxygenColors.textGray,
  },
});
