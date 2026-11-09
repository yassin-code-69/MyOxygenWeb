"use client";

import Link from "next/link";
import { Badge, Container, Group, SimpleGrid, Skeleton, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowRight, IconHome, IconMilk, IconShoppingBag, IconSparkles } from "@tabler/icons-react";
import { BrandButton } from "../components/BrandButton";
import { SearchForm } from "../components/storefront/SearchForm";
import { StorefrontShell } from "../components/storefront/StorefrontShell";
import {
  formatProductCount,
  getCategoryVisual,
  rankShowcaseCategories,
} from "../components/storefront/category-visuals";
import { useCategories } from "../hooks/catalog/use-categories";
import classes from "../components/storefront/NotFound.module.css";

const MAX_DESTINATIONS = 4;

function Destinations() {
  const { categories, isLoaded } = useCategories();
  const destinations = rankShowcaseCategories(categories).slice(0, MAX_DESTINATIONS);

  if (isLoaded && destinations.length === 0) {
    return null;
  }

  return (
    <Stack gap="md" w="100%" mt="md">
      <Text fw={700} size="sm" c="dimmed" ta="center" tt="uppercase" lts="0.05em">
        Or explore our categories
      </Text>
      <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md" component="ul" className={classes.destinationList}>
        {isLoaded
          ? destinations.map((category, index) => {
              const visual = getCategoryVisual(category, index);
              const Glyph = visual.glyph;
              return (
                <li key={category.id}>
                  <Link href={`/categories/${category.slug}`} className={classes.destination}>
                    <Group justify="space-between" wrap="nowrap" gap="sm">
                      <Group gap="sm" wrap="nowrap">
                        <ThemeIcon size={44} radius="md" variant="light" color={visual.accent}>
                          <Glyph size={24} aria-hidden />
                        </ThemeIcon>
                        <div>
                          <Text fw={700} c="var(--mo-color-text)" ff="var(--mo-font-heading)">
                            {category.name}
                          </Text>
                          <Text size="xs" c="dimmed" className="mo-tabular-nums">
                            {formatProductCount(category.productCount)}
                          </Text>
                        </div>
                      </Group>
                      <IconArrowRight size={18} className={classes.destinationArrow} aria-hidden />
                    </Group>
                    {visual.description ? (
                      <Text size="xs" c="var(--mo-color-text-secondary)" mt="xs" lh={1.5}>
                        {visual.description}
                      </Text>
                    ) : null}
                  </Link>
                </li>
              );
            })
          : Array.from({ length: MAX_DESTINATIONS }, (_, index) => (
              <li key={index} aria-hidden>
                <Skeleton height={92} radius="md" />
              </li>
            ))}
      </SimpleGrid>
    </Stack>
  );
}

/** Branded 404 with search, primary actions and live category shortcuts. */
export function NotFoundClient() {
  return (
    <StorefrontShell>
      <div className={classes.page}>
        <span className={`${classes.orb} ${classes.orbPink}`} aria-hidden />
        <span className={`${classes.orb} ${classes.orbPurple}`} aria-hidden />

        <Container size="md" py={{ base: 40, sm: 60 }} pos="relative">
          <Stack align="center" gap="xl">
            <Badge
              size="lg"
              variant="light"
              color="primaryPink"
              c="var(--mo-color-text-brand)"
              leftSection={<IconSparkles size={14} aria-hidden />}
              tt="none"
            >
              Page not found · Error 404
            </Badge>

            <div className={classes.codeWrap} aria-hidden>
              <span className={classes.code}>404</span>
              <span className={classes.codeIcon}>
                <IconMilk size={32} />
              </span>
            </div>

            <Stack align="center" gap="xs" maw={580} ta="center">
              <Title order={1} fz={{ base: 24, sm: 32 }}>
                Oops! This care page took a detour
              </Title>
              <Text c="dimmed" lh={1.6}>
                The page or product you are looking for may have been moved, renamed or is no longer available. All our
                mother and baby essentials are just a click away.
              </Text>
            </Stack>

            <SearchForm className={classes.search} size="lg" placeholder="Search diapers, mother care, skin lotion…" />

            <Group gap="md" justify="center">
              <BrandButton component={Link} href="/" size="lg" leftSection={<IconHome size={20} aria-hidden />}>
                Back to Home
              </BrandButton>
              <BrandButton
                component={Link}
                href="/products"
                size="lg"
                variant="outline"
                leftSection={<IconShoppingBag size={20} aria-hidden />}
              >
                Browse all products
              </BrandButton>
            </Group>

            <Destinations />
          </Stack>
        </Container>
      </div>
    </StorefrontShell>
  );
}
