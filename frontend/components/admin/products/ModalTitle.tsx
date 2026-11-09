import type { ReactNode } from "react";
import { Group, Text, ThemeIcon } from "@mantine/core";

export interface ModalTitleProps {
  /** Tabler icon element, e.g. `<IconTruckDelivery size={18} />`. */
  icon: ReactNode;
  children: ReactNode;
  /** `danger` for destructive dialogs. Default: the green admin accent. */
  tone?: "default" | "danger";
}

/** Modal / drawer heading used by the operations pages: soft icon badge + bold title. */
export function ModalTitle({ icon, children, tone = "default" }: ModalTitleProps) {
  const danger = tone === "danger";
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon
        size={32}
        radius="md"
        variant="light"
        bg={danger ? "var(--mo-color-danger-1)" : "var(--mo-color-secondary-1)"}
        c={danger ? "var(--mo-color-danger-8)" : "var(--mo-color-secondary-8)"}
        aria-hidden
      >
        {icon}
      </ThemeIcon>
      <Text fw={700} lineClamp={1}>
        {children}
      </Text>
    </Group>
  );
}
