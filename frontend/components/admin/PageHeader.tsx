import type { ReactNode } from "react";
import { Box, Group, Text, Title } from "@mantine/core";

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Primary actions (buttons), right-aligned on wide screens. */
  actions?: ReactNode;
}

/** Page title row used by every back-office page. */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <Group justify="space-between" align="flex-end" gap="md" wrap="wrap" mb="lg">
      <Box maw={720}>
        <Title order={1} fz={{ base: 24, sm: 28 }}>
          {title}
        </Title>
        {description ? (
          <Text c="dimmed" size="sm" mt={4}>
            {description}
          </Text>
        ) : null}
      </Box>
      {actions ? (
        <Group gap="sm" wrap="wrap">
          {actions}
        </Group>
      ) : null}
    </Group>
  );
}
