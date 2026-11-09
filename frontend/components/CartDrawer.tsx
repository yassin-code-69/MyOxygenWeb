"use client";

import Link from "next/link";
import { Badge, Box, Divider, Drawer, Group, Skeleton, Stack, Text } from "@mantine/core";
import { IconArrowRight, IconLock, IconShoppingBag } from "@tabler/icons-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { BrandButton } from "./BrandButton";
import { EmptyState } from "./EmptyState";
import { CartLineItem } from "./checkout/CartLineItem";
import { CouponField } from "./checkout/CouponField";
import { FreeDeliveryProgress } from "./checkout/FreeDeliveryProgress";
import { OrderTotals } from "./checkout/OrderTotals";
import { useAuthReady } from "../hooks/auth/use-auth-ready";
import { buildLoginHref } from "../hooks/auth/redirect";
import { useCartReady } from "../hooks/checkout/use-cart-ready";
import { useCouponPreview } from "../hooks/checkout/use-coupon-preview";
import { useAuthStore } from "../lib/auth-store";
import { useCartStore } from "../lib/cart-store";
import { brand, semantic } from "../tokens";
import { springs } from "../tokens/motion";

function DrawerSkeleton() {
  return (
    <Stack gap="md" aria-hidden>
      <Skeleton h={8} radius="xl" />
      {[0, 1].map((row) => (
        <Group key={row} align="flex-start" wrap="nowrap" gap="sm">
          <Skeleton w={72} h={72} radius="md" />
          <Stack gap={8} style={{ flex: 1 }}>
            <Skeleton h={14} w="80%" radius="xl" />
            <Skeleton h={12} w="40%" radius="xl" />
            <Skeleton h={28} w={110} radius="xl" />
          </Stack>
        </Group>
      ))}
    </Stack>
  );
}

/**
 * Slide-out cart: line items (animated in/out with layout transitions), free
 * delivery progress, coupon entry with live re-validation, totals and the
 * checkout CTA (or a sign-in redirect for guests).
 */
export function CartDrawer() {
  const isDrawerOpen = useCartStore((state) => state.isDrawerOpen);
  const closeDrawer = useCartStore((state) => state.closeDrawer);
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const cartReady = useCartReady();
  const authReady = useAuthReady();
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const reduceMotion = useReducedMotion();

  const coupon = useCouponPreview({ enabled: isDrawerOpen });
  const { totals, couponCode, isRecalculating } = coupon;
  const itemCount = cartReady ? totals.itemCount : 0;
  const hasItems = cartReady && items.length > 0;
  const checkoutHref = isAuthenticated ? "/checkout" : buildLoginHref("/checkout");
  const exitOffset = reduceMotion ? 0 : 32;

  return (
    <Drawer
      opened={isDrawerOpen}
      onClose={closeDrawer}
      position="right"
      size="md"
      padding="lg"
      title={
        // Rendered inside the drawer's <h2>: phrasing (inline) elements only.
        <Group component="span" gap="xs" wrap="nowrap">
          <Box
            component="span"
            w={34}
            h={34}
            display="inline-flex"
            style={{
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "var(--mantine-radius-xl)",
              backgroundColor: semantic.surfaceBrandTint,
              color: brand.primary,
            }}
            aria-hidden
          >
            <IconShoppingBag size={18} />
          </Box>
          <Text component="span" fw={700} size="lg" ff="var(--mo-font-heading)" c={semantic.text}>
            Your cart
          </Text>
          {itemCount > 0 ? (
            <Badge color="primaryPink" variant="light" size="sm" aria-label={`${itemCount} items`}>
              {itemCount}
            </Badge>
          ) : null}
        </Group>
      }
      closeButtonProps={{ "aria-label": "Close cart" }}
      styles={{
        content: { display: "flex", flexDirection: "column", backgroundColor: semantic.canvas },
        header: { backgroundColor: semantic.canvas, borderBottom: `1px solid ${semantic.borderBrand}` },
        body: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, paddingTop: 16 },
      }}
    >
      {!cartReady ? (
        <DrawerSkeleton />
      ) : hasItems ? (
        <Stack gap="md" style={{ flex: 1, minHeight: 0 }}>
          <FreeDeliveryProgress subtotal={totals.subtotal} />

          <Box
            component="ul"
            aria-label="Items in your cart"
            m={0}
            p={0}
            style={{ listStyle: "none", flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {items.map((item) => (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: exitOffset }}
                  transition={springs.gentle}
                  style={{ paddingBlock: 12, borderBottom: `1px solid ${semantic.borderBrand}` }}
                >
                  <CartLineItem
                    item={item}
                    editable
                    onQuantityChange={(quantity) => updateQuantity(item.id, quantity)}
                    onRemove={() => removeItem(item.id)}
                    onNavigate={closeDrawer}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </Box>

          <Stack
            gap="md"
            p="md"
            style={{
              borderRadius: "var(--mantine-radius-md)",
              backgroundColor: semantic.surface,
              border: `1px solid ${semantic.borderBrand}`,
              boxShadow: "var(--mo-shadow-card)",
            }}
          >
            <CouponField coupon={coupon} />
            <Divider color={semantic.borderBrand} />
            <OrderTotals totals={totals} couponCode={couponCode} isRecalculating={isRecalculating} size="sm" />
            <BrandButton
              component={Link}
              href={checkoutHref}
              onClick={closeDrawer}
              size="md"
              fullWidth
              disabled={!authReady}
              leftSection={isAuthenticated ? null : <IconLock size={16} aria-hidden />}
              rightSection={<IconArrowRight size={18} aria-hidden />}
            >
              {isAuthenticated ? "Proceed to checkout" : "Sign in to checkout"}
            </BrandButton>
            {!isAuthenticated ? (
              <Text size="xs" c="dimmed" ta="center">
                Your cart is saved — you&apos;ll come straight back to checkout after signing in.
              </Text>
            ) : null}
          </Stack>
        </Stack>
      ) : (
        <EmptyState
          withCard={false}
          icon={<IconShoppingBag stroke={1.6} color={brand.primary} />}
          title="Your cart is empty"
          description="Browse our baby, mother and skincare essentials and add your favourites here."
          titleOrder={2}
          action={
            <BrandButton component={Link} href="/products" onClick={closeDrawer} rightSection={<IconArrowRight size={16} aria-hidden />}>
              Browse products
            </BrandButton>
          }
        />
      )}
    </Drawer>
  );
}
