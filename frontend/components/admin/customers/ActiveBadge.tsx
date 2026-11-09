import { Badge, type MantineSize } from "@mantine/core";
import { IconCircleCheck, IconCircleOff } from "@tabler/icons-react";

export interface ActiveBadgeProps {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
  size?: MantineSize;
}

/** Pill for an account / record that can be switched off (icon + text, never color alone). */
export function ActiveBadge({ active, activeLabel = "Active", inactiveLabel = "Inactive", size = "sm" }: ActiveBadgeProps) {
  return (
    <Badge
      color={active ? "success" : "gray"}
      variant="light"
      radius="xl"
      size={size}
      tt="none"
      fw={600}
      style={{ flexShrink: 0, maxWidth: "none", overflow: "visible" }}
      leftSection={active ? <IconCircleCheck size={12} aria-hidden /> : <IconCircleOff size={12} aria-hidden />}
    >
      {active ? activeLabel : inactiveLabel}
    </Badge>
  );
}
