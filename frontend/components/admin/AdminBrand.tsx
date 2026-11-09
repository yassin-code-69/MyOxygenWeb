import Link from "next/link";
import { Anchor, Badge, Box, Group, Text, ThemeIcon } from "@mantine/core";
import { IconShieldCheck } from "@tabler/icons-react";

export interface AdminBrandProps {
  /** Where the logo links (the user's landing page). */
  href: string;
  onNavigate?: () => void;
}

/** "My Oxygen · Admin" brand mark for the header. */
export function AdminBrand({ href, onNavigate }: AdminBrandProps) {
  return (
    <Anchor
      component={Link}
      href={href}
      onClick={onNavigate}
      underline="never"
      c="inherit"
      aria-label="My Oxygen back-office home"
    >
      <Group gap="sm" wrap="nowrap">
        <ThemeIcon
          size={38}
          radius="md"
          variant="gradient"
          gradient={{ from: "primaryPink.6", to: "primaryPink.3", deg: 135 }}
          aria-hidden
        >
          <IconShieldCheck size={20} stroke={2.2} />
        </ThemeIcon>
        <Box style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            <Text fw={700} ff="var(--mo-font-heading)" lh={1.2}>
              My Oxygen
            </Text>
            <Badge size="xs" variant="light" color="primaryPink">
              Admin
            </Badge>
          </Group>
          <Text size="xs" c="dimmed" lh={1.3} visibleFrom="xs">
            Store back-office
          </Text>
        </Box>
      </Group>
    </Anchor>
  );
}
