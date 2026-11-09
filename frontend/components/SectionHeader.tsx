import type { CSSProperties, ReactNode } from "react";
import { Box, Group, Stack, Text, Title, type TitleOrder } from "@mantine/core";

export interface SectionHeaderProps {
  title: ReactNode;
  /** Small uppercase label above the title (e.g. "Featured"). */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Right-aligned slot (e.g. "View all" link). Wraps below on small screens. */
  action?: ReactNode;
  /** Heading level. Default 2. */
  order?: TitleOrder;
  align?: "left" | "center";
  className?: string;
  style?: CSSProperties;
}

/**
 * Consistent section heading for storefront rails and admin panels:
 * eyebrow (AA brand pink) → Poppins title → muted description, with an optional action.
 */
export function SectionHeader({
  title,
  eyebrow,
  description,
  action,
  order = 2,
  align = "left",
  className,
  style,
}: SectionHeaderProps) {
  const centered = align === "center";

  return (
    <Group
      justify={centered ? "center" : "space-between"}
      align="flex-end"
      gap="md"
      mb="lg"
      wrap="wrap"
      className={className}
      style={style}
    >
      <Stack gap={4} ta={centered ? "center" : "left"} maw={centered ? 640 : undefined}>
        {eyebrow ? (
          <Text
            size="xs"
            fw={700}
            tt="uppercase"
            c="var(--mo-color-text-brand)"
            style={{ letterSpacing: "0.08em" }}
          >
            {eyebrow}
          </Text>
        ) : null}
        <Title order={order} c="var(--mo-color-text)">
          {title}
        </Title>
        {description ? (
          <Text size="sm" c="dimmed" maw={560} mx={centered ? "auto" : undefined}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {action && !centered ? <Box>{action}</Box> : null}
      {action && centered ? <Box w="100%" ta="center">{action}</Box> : null}
    </Group>
  );
}
