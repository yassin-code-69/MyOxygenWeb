import { Group, Text, type MantineColor } from "@mantine/core";
import { cssColor } from "../kit";
import kitClasses from "../kit/kit.module.css";

export interface SeriesLegendItem {
  key: string;
  label: string;
  color: MantineColor;
}

/**
 * Chart legend in the order given (the kit chart's built-in legend sorts
 * series by name and overlaps the plot when it wraps on phones).
 */
export function SeriesLegend({ items }: { items: readonly SeriesLegendItem[] }) {
  return (
    <Group component="ul" gap="md" justify="flex-end" wrap="wrap" m={0} mb="xs" p={0} style={{ listStyle: "none" }} aria-hidden>
      {items.map((item) => (
        <Group component="li" key={item.key} gap={6} wrap="nowrap">
          <span className={kitClasses.dot} style={{ backgroundColor: cssColor(item.color) }} />
          <Text span size="xs" c="var(--mo-color-text-secondary)">
            {item.label}
          </Text>
        </Group>
      ))}
    </Group>
  );
}
