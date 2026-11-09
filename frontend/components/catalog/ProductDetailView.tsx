"use client";

import { useState } from "react";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Breadcrumbs,
  Container,
  Divider,
  Grid,
  Group,
  NumberInput,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconBolt,
  IconCash,
  IconChevronRight,
  IconMinus,
  IconPlus,
  IconRefresh,
  IconShieldCheck,
  IconShoppingCart,
  IconTruckDelivery,
} from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { CountDownTimer } from "../CountDownTimer";
import { EmptyState } from "../EmptyState";
import { startPageProgress } from "../PageProgressBar";
import { Price } from "../Price";
import { ProductCard } from "../ProductCard";
import { SectionHeader } from "../SectionHeader";
import { ProductDetailSkeleton } from "./ProductDetailSkeleton";
import { ProductGallery } from "./ProductGallery";
import { DELIVERY_FEE, FREE_DELIVERY_THRESHOLD, ProductInfoTabs } from "./ProductInfoTabs";
import { isPurchasable, toCartItemDraft, toProductCardData } from "./product-mappers";
import { formatBDT, formatMonthYear } from "../../lib/format";
import { getErrorMessage } from "../../lib/api-client";
import { useCartStore } from "../../lib/cart-store";
import { useProductDetail } from "../../hooks/use-product-detail";
import { useAddToCart } from "../../hooks/catalog/use-add-to-cart";
import type { CatalogProductDetailDTO } from "../../types/catalog";
import classes from "./ProductDetail.module.css";

/** Per-order quantity cap on the product page (also bounded by stock). */
const MAX_PER_ORDER = 10;

function StockBadge({ product }: { product: CatalogProductDetailDTO }) {
  if (!isPurchasable(product)) {
    return (
      <Badge size="md" variant="filled" color="gray">
        Out of stock
      </Badge>
    );
  }
  if (product.isLowStock) {
    return (
      <Badge size="md" variant="light" color="warning" c="var(--mo-color-text-warning)">
        Only {product.totalStock} left
      </Badge>
    );
  }
  return (
    <Badge size="md" variant="light" color="secondaryGreen" c="var(--mo-color-text-success)">
      In stock
    </Badge>
  );
}

function BatchTransparencyAlert({ product }: { product: CatalogProductDetailDTO }) {
  const [earliest] = product.batchSummary;
  if (!product.requiresBatchTracking || !earliest) {
    return null;
  }
  const units = product.batchSummary.reduce((sum, batch) => sum + batch.availableQuantity, 0);
  const batchCount = product.batchSummary.length;

  return (
    <Alert
      variant="light"
      color="secondaryGreen"
      radius="md"
      icon={<IconShieldCheck size={22} aria-hidden />}
      title="Batch-tracked freshness"
      styles={{
        root: { backgroundColor: "var(--mo-color-surface-success-tint)", border: "1px solid var(--mo-color-secondary-2)" },
        title: { color: "var(--mo-color-secondary-9)", fontWeight: 700 },
        message: { color: "var(--mo-color-text-success)" },
      }}
    >
      <Text size="sm" fw={600} inherit>
        Earliest batch expires {formatMonthYear(earliest.expiryDate) ?? earliest.expiryDate} ({earliest.availableQuantity}{" "}
        {earliest.availableQuantity === 1 ? "unit" : "units"}). {units} {units === 1 ? "unit" : "units"} in stock across{" "}
        {batchCount} {batchCount === 1 ? "batch" : "batches"} — we always ship the earliest-expiring batch first.
      </Text>
    </Alert>
  );
}

function QuantityStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const clamp = (next: number) => Math.min(max, Math.max(1, Math.floor(next)));
  return (
    <div className={classes.stepper}>
      <ActionIcon
        variant="subtle"
        color="gray"
        radius="xl"
        disabled={disabled || value <= 1}
        onClick={() => onChange(clamp(value - 1))}
        aria-label="Decrease quantity"
      >
        <IconMinus size={14} />
      </ActionIcon>
      <NumberInput
        variant="unstyled"
        className={classes.stepperInput}
        aria-label="Quantity"
        value={value}
        min={1}
        max={max}
        clampBehavior="strict"
        allowDecimal={false}
        allowNegative={false}
        hideControls
        disabled={disabled}
        onChange={(next) => {
          if (typeof next === "number" && Number.isFinite(next)) {
            onChange(clamp(next));
          }
        }}
      />
      <ActionIcon
        variant="subtle"
        color="gray"
        radius="xl"
        disabled={disabled || value >= max}
        onClick={() => onChange(clamp(value + 1))}
        aria-label="Increase quantity"
      >
        <IconPlus size={14} />
      </ActionIcon>
    </div>
  );
}

function ProductDetailContent({ product, onRefresh }: { product: CatalogProductDetailDTO; onRefresh: () => void }) {
  const router = useRouter();
  const addToCart = useAddToCart();
  const [quantity, setQuantity] = useState(1);

  const purchasable = isPurchasable(product);
  const maxQuantity = Math.max(1, Math.min(product.totalStock, MAX_PER_ORDER));
  const qty = Math.min(quantity, maxQuantity);
  const discounted = product.discountAmount > 0 && product.effectivePrice < product.basePrice;
  const discountPercent = discounted ? Math.round(product.discountPercent) : 0;
  const flashSale = product.activeDiscount?.isFlashSale ? product.activeDiscount : null;

  const handleAddToCart = () => {
    addToCart(product, { quantity: qty });
  };

  const handleBuyNow = () => {
    if (!purchasable) {
      return;
    }
    const cart = useCartStore.getState();
    const existing = cart.items.find((item) => item.id === product.id);
    if (existing) {
      // Never double up or shrink what is already in the cart.
      cart.updateQuantity(product.id, Math.max(existing.quantity, qty));
    } else {
      cart.addItem(toCartItemDraft(product, qty));
    }
    cart.closeDrawer();
    startPageProgress();
    router.push("/checkout");
  };

  return (
    <Container size="xl" py="lg">
      <Breadcrumbs
        separator={<IconChevronRight size={13} color="var(--mo-color-icon-muted)" aria-hidden />}
        mb="xl"
        aria-label="Breadcrumb"
      >
        <Anchor component={Link} href="/" size="xs" c="dimmed">
          Home
        </Anchor>
        <Anchor component={Link} href={`/categories/${product.category.slug}`} size="xs" c="dimmed">
          {product.category.name}
        </Anchor>
        <Text size="xs" fw={600} c="var(--mo-color-text-brand)" lineClamp={1} aria-current="page">
          {product.title}
        </Text>
      </Breadcrumbs>

      <Grid gap={40}>
        <Grid.Col span={{ base: 12, md: 6 }}>
          <div className={classes.galleryColumn}>
            <ProductGallery images={product.images} title={product.title} discountPercent={discountPercent} />
          </div>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 6 }}>
          <Stack gap="md">
            <Group gap="xs" wrap="wrap">
              {product.brand ? (
                <Badge size="md" variant="light" color="accentPurple" c="var(--mo-color-text-accent)">
                  {product.brand}
                </Badge>
              ) : null}
              <Badge
                size="md"
                variant="outline"
                color="primaryPink"
                component={Link}
                href={`/categories/${product.category.slug}`}
                style={{ cursor: "pointer" }}
              >
                {product.category.name}
              </Badge>
              <StockBadge product={product} />
            </Group>

            <h1 className={classes.title}>{product.title}</h1>
            <Text size="xs" c="dimmed">
              SKU <span className="mo-tabular-nums">{product.sku}</span>
            </Text>

            <Group gap="sm" align="center" wrap="wrap">
              <Price
                value={product.effectivePrice}
                compareAt={discounted ? product.basePrice : null}
                tone="brand"
                size="xl"
                fw={800}
                fz={{ base: "1.75rem", sm: "2.1rem" }}
              />
              {discounted ? (
                <Badge size="lg" variant="filled" color="primaryPink.8" className="mo-tabular-nums">
                  -{discountPercent}%
                </Badge>
              ) : null}
            </Group>
            {discounted ? (
              <Text size="sm" fw={600} c="var(--mo-color-text-success)">
                You save {formatBDT(product.discountAmount)}
              </Text>
            ) : null}

            {flashSale ? (
              <div className={classes.flashPanel}>
                <Group justify="space-between" align="center" gap="sm" wrap="wrap">
                  <Group gap={6} wrap="nowrap">
                    <IconBolt size={18} color="var(--mo-color-text-brand)" aria-hidden />
                    <Text size="sm" fw={700} c="var(--mo-color-text-brand)">
                      {flashSale.name ?? "Flash sale"} ends in
                    </Text>
                  </Group>
                  <CountDownTimer endsAt={flashSale.endsAt} onExpire={onRefresh} label="Flash sale ends in" />
                </Group>
              </div>
            ) : null}

            <BatchTransparencyAlert product={product} />

            <Divider color="var(--mo-color-border-subtle)" />

            {purchasable ? (
              <Group gap="md" align="center">
                <Text size="sm" fw={700} c="var(--mo-color-text)" component="span">
                  Quantity
                </Text>
                <QuantityStepper value={qty} max={maxQuantity} disabled={!purchasable} onChange={setQuantity} />
                <Text size="xs" c="dimmed">
                  Up to {maxQuantity} per order
                </Text>
              </Group>
            ) : (
              <Alert
                variant="light"
                color="warning"
                radius="md"
                icon={<IconAlertTriangle size={20} aria-hidden />}
                title="Out of stock"
                styles={{ title: { color: "var(--mo-color-text-warning)" }, message: { color: "var(--mo-color-text)" } }}
              >
                This product is not available right now.{" "}
                <Anchor component={Link} href={`/categories/${product.category.slug}`} size="sm" fw={600}>
                  Browse more {product.category.name}
                </Anchor>
              </Alert>
            )}

            <Group gap="md" grow>
              <BrandButton
                size="lg"
                disabled={!purchasable}
                onClick={handleAddToCart}
                leftSection={<IconShoppingCart size={20} aria-hidden />}
              >
                {purchasable ? "Add to Cart" : "Out of stock"}
              </BrandButton>
              {purchasable ? (
                <BrandButton
                  variant="secondary"
                  size="lg"
                  onClick={handleBuyNow}
                  leftSection={<IconBolt size={20} aria-hidden />}
                >
                  Buy Now
                </BrandButton>
              ) : null}
            </Group>

            <Stack gap="sm" className={classes.perks}>
              <div className={classes.perk}>
                <IconTruckDelivery size={20} className={classes.perkIcon} aria-hidden />
                <span>
                  Free delivery across Bangladesh on orders of {formatBDT(FREE_DELIVERY_THRESHOLD)} or more (
                  {formatBDT(DELIVERY_FEE)} below that).
                </span>
              </div>
              <div className={classes.perk}>
                <IconCash size={20} className={classes.perkIcon} aria-hidden />
                <span>Cash on delivery available.</span>
              </div>
              {product.requiresBatchTracking ? (
                <div className={classes.perk}>
                  <IconShieldCheck size={20} className={classes.perkIcon} aria-hidden />
                  <span>Batch-tracked: only unexpired stock is sold, earliest expiry first.</span>
                </div>
              ) : null}
            </Stack>
          </Stack>
        </Grid.Col>
      </Grid>

      <section aria-label="Product information" className={classes.tabsCard}>
        <ProductInfoTabs product={product} />
      </section>

      {product.relatedProducts.length > 0 ? (
        <section aria-labelledby="related-title">
          <SectionHeader
            eyebrow="You may also like"
            title={<span id="related-title">Related essentials</span>}
            action={
              <Anchor component={Link} href={`/categories/${product.category.slug}`} size="sm" fw={700}>
                More in {product.category.name}
              </Anchor>
            }
          />
          <ul className={classes.relatedGrid}>
            {product.relatedProducts.map((related) => (
              <li key={related.id}>
                <ProductCard
                  product={toProductCardData(related)}
                  onAddToCart={() => {
                    addToCart(related);
                  }}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Container>
  );
}

/** `/products/[slug]` body: loads the product, then renders the detail; 404 → not-found page. */
export function ProductDetailView({ slug }: { slug: string }) {
  const { product, error, isNotFound, isLoading, mutate } = useProductDetail(slug);

  if (isNotFound) {
    notFound();
  }

  if (product) {
    return (
      <ProductDetailContent
        key={product.id}
        product={product}
        onRefresh={() => {
          void mutate();
        }}
      />
    );
  }

  if (error && !isLoading) {
    return (
      <Container size="sm" py={64}>
        <EmptyState
          title="We couldn't load this product"
          description={getErrorMessage(error)}
          color="danger"
          action={
            <Group gap="sm" justify="center">
              <BrandButton leftSection={<IconRefresh size={16} aria-hidden />} onClick={() => void mutate()}>
                Try again
              </BrandButton>
              <BrandButton component={Link} href="/products" variant="outline">
                Browse products
              </BrandButton>
            </Group>
          }
        />
      </Container>
    );
  }

  return <ProductDetailSkeleton />;
}
