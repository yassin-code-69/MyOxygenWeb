"use client";

import Link from "next/link";
import { Badge, Container, Grid, Group, Stack, Text } from "@mantine/core";
import { IconArrowRight, IconBolt } from "@tabler/icons-react";
import { AnimatedSection } from "../AnimatedSection";
import { BrandButton } from "../BrandButton";
import { CountDownTimer } from "../CountDownTimer";
import { ImageWithFallback } from "../ImageWithFallback";
import { Price } from "../Price";
import { formatBDT } from "../../lib/format";
import { useFlashSales } from "../../hooks/catalog/use-flash-sales";
import type { CatalogFlashSaleDTO } from "../../types/catalog";
import classes from "./FlashSaleBanner.module.css";

const MAX_EXTRA_SALES = 3;

/** "20% off" / "৳230 off". */
export function formatDiscountValue(sale: Pick<CatalogFlashSaleDTO, "type" | "value">): string {
  return sale.type === "PERCENTAGE" ? `${sale.value}% off` : `${formatBDT(sale.value)} off`;
}

/** Where a sale leads: the product, the category, or the whole shop. */
export function flashSaleHref(sale: CatalogFlashSaleDTO): string {
  if (sale.scope === "PRODUCT" && sale.product) {
    return `/products/${sale.product.slug}`;
  }
  if (sale.scope === "CATEGORY" && sale.category) {
    return `/categories/${sale.category.slug}`;
  }
  return "/products";
}

function saleTitle(sale: CatalogFlashSaleDTO): string {
  return sale.name ?? sale.product?.title ?? (sale.category ? `${sale.category.name} sale` : "Store-wide sale");
}

function saleSubject(sale: CatalogFlashSaleDTO): string {
  if (sale.scope === "PRODUCT" && sale.product) {
    return sale.product.title;
  }
  if (sale.scope === "CATEGORY" && sale.category) {
    return `Everything in ${sale.category.name}`;
  }
  return "Store-wide";
}

/**
 * Home flash-sale banner from `GET /catalog/flash-sales`: the soonest-ending running
 * sale with a live countdown, plus links to other running sales. Renders nothing when
 * no flash sale is running (or while loading — it never shows placeholder deals).
 */
export function FlashSaleBanner() {
  const { sales, mutate } = useFlashSales();
  const [featured, ...others] = sales;

  if (!featured) {
    return null;
  }

  const href = flashSaleHref(featured);
  const product = featured.scope === "PRODUCT" ? featured.product : null;
  const refresh = () => {
    void mutate();
  };

  return (
    <AnimatedSection id="flash-sale" className={classes.section} aria-labelledby="flash-sale-title">
      <Container size="xl">
        <div className={classes.banner}>
          <Grid align="center" gap="xl" className={classes.content}>
            <Grid.Col span={{ base: 12, md: product ? 8 : 12 }}>
              <Stack gap="sm" align="flex-start">
                <Badge
                  size="lg"
                  variant="filled"
                  color="primaryPink.8"
                  leftSection={<IconBolt size={14} stroke={2.4} aria-hidden />}
                >
                  Flash sale · {formatDiscountValue(featured)}
                </Badge>
                <h2 id="flash-sale-title" className={classes.title}>
                  {saleTitle(featured)}
                </h2>
                <Text size="sm" fw={600} c="var(--mo-color-text-secondary)">
                  {saleSubject(featured)}
                </Text>
                {product ? (
                  <Price
                    value={product.effectivePrice}
                    compareAt={product.basePrice}
                    tone="brand"
                    size="xl"
                    fw={800}
                  />
                ) : null}
                <Group gap="sm" align="center" wrap="wrap">
                  <Text size="xs" fw={700} tt="uppercase" c="var(--mo-color-text-brand)" lts="0.06em">
                    Ends in
                  </Text>
                  <CountDownTimer endsAt={featured.endsAt} onExpire={refresh} label="Flash sale ends in" />
                </Group>
                <BrandButton
                  component={Link}
                  href={href}
                  mt="xs"
                  rightSection={<IconArrowRight size={16} stroke={2.4} aria-hidden />}
                >
                  Shop the deal
                </BrandButton>
              </Stack>

              {others.length > 0 ? (
                <ul className={classes.more} aria-label="More running flash sales">
                  {others.slice(0, MAX_EXTRA_SALES).map((sale) => (
                    <li key={sale.id}>
                      <Link href={flashSaleHref(sale)} className={classes.moreLink}>
                        <span>
                          {saleTitle(sale)} · {formatDiscountValue(sale)}
                        </span>
                        <CountDownTimer variant="compact" endsAt={sale.endsAt} onExpire={refresh} label="Ends in" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </Grid.Col>

            {product ? (
              <Grid.Col span={{ base: 12, md: 4 }}>
                <Link href={href} className={classes.media} aria-label={`View ${product.title}`}>
                  <ImageWithFallback
                    src={product.images[0]}
                    alt=""
                    fill
                    sizes="240px"
                    className={classes.mediaImage}
                  />
                </Link>
              </Grid.Col>
            ) : null}
          </Grid>
        </div>
      </Container>
    </AnimatedSection>
  );
}
