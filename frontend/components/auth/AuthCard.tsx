import type { ReactNode } from "react";
import { Container, Group, Paper, Skeleton, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { semantic, shadows } from "../../tokens";
import { mantineGradients } from "../../tokens/gradients";

export interface AuthCardProps {
  icon: ReactNode;
  title: string;
  subtitle: ReactNode;
  children: ReactNode;
}

/** Centered card used by `/login` and `/register`. */
export function AuthCard({ icon, title, subtitle, children }: AuthCardProps) {
  return (
    <Container size={480} py={{ base: "xl", md: 56 }}>
      <Paper withBorder radius="md" p={{ base: "lg", sm: 36 }} bg={semantic.surface} shadow="lg">
        <Stack align="center" gap={6} mb="xl">
          <ThemeIcon
            size={56}
            radius="xl"
            variant="gradient"
            gradient={mantineGradients.primary}
            style={{ boxShadow: shadows.button }}
            aria-hidden
          >
            {icon}
          </ThemeIcon>
          <Title order={1} size="h2" ta="center" c={semantic.text} mt={8}>
            {title}
          </Title>
          <Text size="sm" c="dimmed" ta="center">
            {subtitle}
          </Text>
        </Stack>
        {children}
      </Paper>
    </Container>
  );
}

/** Same footprint as `AuthCard` with its form, shown while search params resolve. */
export function AuthCardSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <Container size={480} py={{ base: "xl", md: 56 }} aria-busy="true" aria-label="Loading">
      <Paper withBorder radius="md" p={{ base: "lg", sm: 36 }} bg={semantic.surface}>
        <Stack align="center" gap={10} mb="xl">
          <Skeleton circle h={56} />
          <Skeleton h={26} w={220} radius="xl" />
          <Skeleton h={14} w={280} radius="xl" />
        </Stack>
        <Stack gap="md">
          {Array.from({ length: fields }, (_, index) => (
            <Stack key={index} gap={8}>
              <Skeleton h={12} w={120} radius="xl" />
              <Skeleton h={42} radius="md" />
            </Stack>
          ))}
          <Skeleton h={44} radius="xl" mt="sm" />
          <Group justify="center">
            <Skeleton h={12} w={200} radius="xl" />
          </Group>
        </Stack>
      </Paper>
    </Container>
  );
}
