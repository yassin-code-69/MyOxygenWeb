import { Container, Grid, Group, Paper, Skeleton, Stack } from "@mantine/core";
import { semantic } from "../../tokens";

/** Mirrors the checkout layout (stepper, form card, order summary) to avoid layout shift. */
export function CheckoutSkeleton() {
  return (
    <Container size="lg" py={{ base: "lg", md: "xl" }} aria-busy="true" aria-label="Loading checkout">
      <Skeleton h={32} w={180} radius="xl" mb="lg" />
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
          <Paper withBorder radius="md" p={{ base: "md", sm: "xl" }} bg={semantic.surface}>
            <Group justify="space-between" mb="xl" wrap="nowrap">
              {[0, 1, 2].map((step) => (
                <Group key={step} gap="xs" wrap="nowrap">
                  <Skeleton circle h={36} />
                  <Stack gap={6} visibleFrom="sm">
                    <Skeleton h={12} w={70} radius="xl" />
                    <Skeleton h={10} w={90} radius="xl" />
                  </Stack>
                </Group>
              ))}
            </Group>
            <Skeleton h={24} w={200} radius="xl" mb={8} />
            <Skeleton h={14} w={280} radius="xl" mb="lg" />
            <Grid gap="md">
              {[6, 6, 12, 12, 6, 6, 6].map((span, index) => (
                <Grid.Col key={index} span={{ base: 12, sm: span }}>
                  <Skeleton h={12} w={110} radius="xl" mb={8} />
                  <Skeleton h={36} radius="md" />
                </Grid.Col>
              ))}
            </Grid>
            <Group justify="flex-end" mt="lg">
              <Skeleton h={42} w={200} radius="xl" />
            </Group>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
          <Paper withBorder radius="md" p="lg" bg={semantic.surface}>
            <Skeleton h={20} w={140} radius="xl" mb="md" />
            {[0, 1].map((row) => (
              <Group key={row} wrap="nowrap" mb="md" align="flex-start">
                <Skeleton w={48} h={48} radius="md" />
                <Stack gap={6} style={{ flex: 1 }}>
                  <Skeleton h={12} w="85%" radius="xl" />
                  <Skeleton h={12} w="40%" radius="xl" />
                </Stack>
              </Group>
            ))}
            <Skeleton h={36} radius="xl" mb="md" />
            {[0, 1, 2].map((row) => (
              <Group key={row} justify="space-between" mb={10}>
                <Skeleton h={12} w={90} radius="xl" />
                <Skeleton h={12} w={60} radius="xl" />
              </Group>
            ))}
            <Group justify="space-between" mt="md">
              <Skeleton h={18} w={60} radius="xl" />
              <Skeleton h={22} w={90} radius="xl" />
            </Group>
          </Paper>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
