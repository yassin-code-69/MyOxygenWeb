import { Container, Grid, Group, Skeleton, Stack } from "@mantine/core";
import classes from "./ProductDetail.module.css";

/** Full-page placeholder with the product page's layout (gallery, purchase panel, tabs). */
export function ProductDetailSkeleton() {
  return (
    <Container size="xl" py="lg" aria-busy="true" aria-label="Loading product">
      <Group gap={8} mb="xl" h={20} aria-hidden>
        <Skeleton height={12} width={40} radius="xl" />
        <Skeleton height={12} width={72} radius="xl" />
        <Skeleton height={12} width={140} radius="xl" />
      </Group>

      <Grid gap={40} aria-hidden>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <div className={classes.mainMedia}>
            <Skeleton height="100%" radius="md" />
          </div>
          <Group justify="center" gap={10} mt={14}>
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} height={68} width={68} radius="sm" />
            ))}
          </Group>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            <Group gap="xs">
              <Skeleton height={22} width={80} radius="xl" />
              <Skeleton height={22} width={96} radius="xl" />
            </Group>
            <Skeleton height={32} width="90%" radius="xl" />
            <Skeleton height={32} width="60%" radius="xl" />
            <Skeleton height={14} width={160} radius="xl" />
            <Skeleton height={40} width={220} radius="xl" />
            <Skeleton height={72} radius="md" />
            <Skeleton height={42} width={150} radius="xl" />
            <Group grow>
              <Skeleton height={50} radius="xl" />
              <Skeleton height={50} radius="xl" />
            </Group>
            <Skeleton height={110} radius="md" />
          </Stack>
        </Grid.Col>
      </Grid>

      <div className={classes.tabsCard} aria-hidden>
        <Group gap="lg" mb="lg">
          {[96, 120, 110, 140].map((width) => (
            <Skeleton key={width} height={18} width={width} radius="xl" />
          ))}
        </Group>
        <Stack gap={10}>
          {["100%", "96%", "88%", "70%"].map((width) => (
            <Skeleton key={width} height={14} width={width} radius="xl" />
          ))}
        </Stack>
      </div>
    </Container>
  );
}
