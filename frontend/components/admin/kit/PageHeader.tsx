import type { ReactNode } from "react";
import { Box, Group, Text, ThemeIcon, Title, type MantineSpacing, type StyleProp } from "@mantine/core";

export interface PageHeaderProps {
  title: ReactNode;
  /** Muted line under the title. */
  subtitle?: ReactNode;
  /** Alias of `subtitle` (kept for existing pages). */
  description?: ReactNode;
  /** Small green icon badge before the title (e.g. `<IconChartBar size={18} />`). */
  icon?: ReactNode;
  /** Right-aligned slot: primary actions, a `DateRangePicker`, … */
  actions?: ReactNode;
  /** Bottom margin. Default `lg`. */
  mb?: StyleProp<MantineSpacing>;
}

/**
 * Page title row used by every back-office page (mockup: icon + "Sales
 * Overview" + subtitle, date range on the right).
 *
 * ```tsx
 * <PageHeader icon={<IconChartBar size={18} />} title="Sales Overview"
 *   subtitle="Track your store performance with detailed insights."
 *   actions={<DateRangePicker value={range} onChange={setRange} />} />
 * ```
 */
export function PageHeader({ title, subtitle, description, icon, actions, mb = "lg" }: PageHeaderProps) {
  const caption = subtitle ?? description;
  return (
    <Group justify="space-between" align="center" gap="md" wrap="wrap" mb={mb}>
      <Group gap="sm" align="flex-start" wrap="nowrap" style={{ minWidth: 0, flex: "1 1 320px" }}>
        {icon ? (
          <ThemeIcon
            size={36}
            radius="md"
            variant="light"
            bg="var(--mo-color-secondary-1)"
            c="var(--mo-color-secondary-8)"
            aria-hidden
            mt={2}
          >
            {icon}
          </ThemeIcon>
        ) : null}
        <Box style={{ minWidth: 0 }} maw={760}>
          <Title order={1} fz={{ base: 22, sm: 24 }} fw={600} lh={1.3} c="var(--mo-color-text)">
            {title}
          </Title>
          {caption ? (
            <Text c="var(--mo-color-text-muted)" size="sm" mt={4}>
              {caption}
            </Text>
          ) : null}
        </Box>
      </Group>
      {actions ? (
        <Group gap="sm" wrap="wrap">
          {actions}
        </Group>
      ) : null}
    </Group>
  );
}
