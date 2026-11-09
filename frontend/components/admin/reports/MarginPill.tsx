import { Badge, type MantineSize } from "@mantine/core";
import { formatPercent } from "../format";
import { marginColor } from "./report-utils";

export interface MarginPillProps {
  percent: number;
  size?: MantineSize;
}

/** `40.0%` margin pill (green when healthy, amber when thin, red for a loss). */
export function MarginPill({ percent, size = "md" }: MarginPillProps) {
  const loss = percent < 0;
  return (
    <Badge
      variant="light"
      color={marginColor(percent)}
      radius="xl"
      size={size}
      tt="none"
      fw={700}
      className="mo-tabular-nums"
      aria-label={`${loss ? "Loss, margin" : "Margin"} ${formatPercent(percent)}`}
    >
      {formatPercent(percent)}
    </Badge>
  );
}
