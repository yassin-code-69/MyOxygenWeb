"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Anchor,
  Box,
  Container,
  Divider,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Stepper,
  Text,
  Title,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconArrowLeft, IconChecklist, IconCreditCard, IconShoppingBag, IconTruckDelivery } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { BrandButton } from "../BrandButton";
import { EmptyState } from "../EmptyState";
import { startPageProgress } from "../PageProgressBar";
import { CartLineItem } from "./CartLineItem";
import { CheckoutSkeleton } from "./CheckoutSkeleton";
import { CouponField } from "./CouponField";
import { FreeDeliveryProgress } from "./FreeDeliveryProgress";
import { OrderTotals } from "./OrderTotals";
import { PaymentStep } from "./PaymentStep";
import { ReviewStep } from "./ReviewStep";
import { focusFirstShippingError, ShippingStep } from "./ShippingStep";
import { StepTransition } from "./StepTransition";
import {
  EMPTY_SHIPPING,
  fromShippingAddress,
  shippingSchema,
  toShippingAddress,
  type ShippingFormValues,
} from "./shipping-schema";
import { useRequireAuth } from "../../hooks/auth/use-auth-ready";
import { useCartPriceRefresh } from "../../hooks/checkout/use-cart-price-refresh";
import { useCartReady } from "../../hooks/checkout/use-cart-ready";
import { dropUnavailableProducts, useCouponPreview } from "../../hooks/checkout/use-coupon-preview";
import { parseCheckoutError, usePlaceOrder, type CheckoutProblem } from "../../hooks/checkout/use-place-order";
import { useMyOrders, useOrder } from "../../hooks/orders/use-orders";
import { toCartItemInputs, useCartStore } from "../../lib/cart-store";
import { normalizeBangladeshMobile } from "../../lib/phone";
import { semantic } from "../../tokens";
import type { PaymentMethod, ShippingAddress } from "../../types/order";

type StepIndex = 0 | 1 | 2;

const STEPS = [
  { label: "Shipping", description: "Delivery address", icon: IconTruckDelivery },
  { label: "Payment", description: "Cash on delivery", icon: IconCreditCard },
  { label: "Review", description: "Confirm & place", icon: IconChecklist },
] as const;

function isPristine(values: ShippingFormValues, prefilled: Partial<ShippingFormValues>): boolean {
  return (Object.keys(values) as (keyof ShippingFormValues)[]).every(
    (key) => values[key] === "" || values[key] === prefilled[key]
  );
}

/**
 * `/checkout` — signed-in customers only. Three steps (Shipping → Payment →
 * Review) with a directional slide; the cart and coupon are re-validated live.
 */
export function CheckoutView() {
  const router = useRouter();
  const { status, user } = useRequireAuth("/checkout");
  const authenticated = status === "authenticated";
  const cartReady = useCartReady();

  const items = useCartStore((state) => state.items);
  const clearCart = useCartStore((state) => state.clearCart);
  const removeItem = useCartStore((state) => state.removeItem);
  const setAvailableStock = useCartStore((state) => state.setAvailableStock);
  const setCouponCode = useCartStore((state) => state.setCouponCode);
  const openDrawer = useCartStore((state) => state.openDrawer);

  const coupon = useCouponPreview({ enabled: authenticated });
  const { totals, couponCode, preview, isRecalculating, isChecking } = coupon;
  const { placeOrder } = usePlaceOrder();
  // Re-price from the live catalog (the cart empties after placing, which stops it).
  const { isRefreshing: isRefreshingPrices } = useCartPriceRefresh(authenticated && cartReady);

  const [active, setActive] = useState<StepIndex>(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("COD");
  const [problem, setProblem] = useState<CheckoutProblem | null>(null);
  const [isPlacing, setIsPlacing] = useState(false);
  const [placedOrderNumber, setPlacedOrderNumber] = useState<string | null>(null);

  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const navigatedRef = useRef(false);
  const prefillRef = useRef<Partial<ShippingFormValues>>({});

  const form = useForm<ShippingFormValues>({
    mode: "controlled",
    initialValues: EMPTY_SHIPPING,
    validate: zod4Resolver(shippingSchema),
    validateInputOnBlur: true,
  });

  // Prefill: profile name/phone first, then the address of the latest order (if any).
  const { orders: recentOrders } = useMyOrders(1, 1, authenticated);
  const latestOrderNumber = recentOrders[0]?.orderNumber ?? "";
  const { order: latestOrder } = useOrder(latestOrderNumber, authenticated && latestOrderNumber !== "");

  useEffect(() => {
    if (!user) {
      return;
    }
    const profileValues: Partial<ShippingFormValues> = {
      fullName: user.fullName,
      phone: normalizeBangladeshMobile(user.phone) ?? "",
    };
    if (isPristine(form.getValues(), prefillRef.current)) {
      prefillRef.current = { ...prefillRef.current, ...profileValues };
      form.setValues({ ...form.getValues(), ...profileValues });
    }
    // Runs once per signed-in user; `form` is intentionally not a dependency.
  }, [user?.id]);

  useEffect(() => {
    if (!latestOrder) {
      return;
    }
    const previous = fromShippingAddress(latestOrder.shippingAddress);
    if (isPristine(form.getValues(), prefillRef.current)) {
      prefillRef.current = previous;
      form.setValues(previous);
    }
    // Runs once per loaded order; `form` is intentionally not a dependency.
  }, [latestOrder?.id]);

  // Move focus to the new step's heading after the customer changes step.
  useEffect(() => {
    if (navigatedRef.current) {
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [active]);

  const goTo = useCallback(
    (step: StepIndex) => {
      if (step === active) {
        return;
      }
      navigatedRef.current = true;
      setDirection(step > active ? 1 : -1);
      setActive(step);
      window.scrollTo({ top: 0 });
    },
    [active]
  );

  const address: ShippingAddress | null = (() => {
    const parsed = shippingSchema.safeParse(form.values);
    return parsed.success ? toShippingAddress(parsed.data) : null;
  })();

  const couponBlocked = Boolean(couponCode) && (!preview || isChecking);

  const handleStepClick = (step: number) => {
    if (step < active && (step === 0 || step === 1)) {
      goTo(step);
    }
  };

  const handleAdjustQuantity = (productId: string, available: number) => {
    setAvailableStock(productId, available);
    setProblem(null);
  };

  const handleRemoveItem = (productId: string) => {
    removeItem(productId);
    setProblem(null);
  };

  const handlePlaceOrder = async () => {
    const parsed = shippingSchema.safeParse(form.getValues());
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        if (field && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      form.setErrors(errors);
      goTo(0);
      // Wait for the slide back to the shipping step before moving focus.
      window.setTimeout(() => focusFirstShippingError(errors), 400);
      return;
    }
    if (items.length === 0 || couponBlocked || isRefreshingPrices) {
      return;
    }

    setIsPlacing(true);
    setProblem(null);
    try {
      const order = await placeOrder({
        shippingAddress: toShippingAddress(parsed.data),
        items: toCartItemInputs(items),
        paymentMethod,
        ...(couponCode ? { couponCode } : {}),
      });
      setPlacedOrderNumber(order.orderNumber);
      clearCart();
      notifications.show({
        color: "success",
        title: "Order placed",
        message: `Order ${order.orderNumber} is confirmed. Thank you!`,
      });
      startPageProgress();
      router.push(`/orders/${encodeURIComponent(order.orderNumber)}?placed=1`);
    } catch (error) {
      const next = parseCheckoutError(error);
      switch (next.kind) {
        case "unavailable":
          dropUnavailableProducts(next.productIds);
          break;
        case "invalid-coupon":
          setCouponCode(null);
          break;
        case "validation":
          form.setErrors(next.fieldErrors);
          if (Object.keys(next.fieldErrors).length > 0) {
            goTo(0);
          }
          break;
        case "unauthorized":
          notifications.show({ color: "warning", title: "Please sign in again", message: next.message });
          break;
        default:
          break;
      }
      setProblem(next);
    } finally {
      setIsPlacing(false);
    }
  };

  if (placedOrderNumber) {
    return (
      <Container size="sm" py="xl">
        <Stack align="center" gap="sm" py="xl" role="status" aria-live="polite">
          <Loader />
          <Text fw={600} c={semantic.text}>
            Order {placedOrderNumber} placed — opening your order…
          </Text>
        </Stack>
      </Container>
    );
  }

  if (!authenticated || !cartReady) {
    return <CheckoutSkeleton />;
  }

  if (items.length === 0) {
    return (
      <Container size="sm" py={{ base: "xl", md: 64 }}>
        <Title order={1} size="h2" c={semantic.text} mb="lg">
          Checkout
        </Title>
        <EmptyState
          titleOrder={2}
          icon={<IconShoppingBag stroke={1.6} />}
          title="Your cart is empty"
          description="Add a few essentials to your cart, then come back here to check out."
          action={
            <BrandButton component={Link} href="/products">
              Browse products
            </BrandButton>
          }
        />
      </Container>
    );
  }

  return (
    <Container size="lg" py={{ base: "lg", md: "xl" }}>
      <Group justify="space-between" align="flex-end" mb="lg" wrap="wrap" gap="xs">
        <Stack gap={2}>
          <Title order={1} size="h2" c={semantic.text}>
            Checkout
          </Title>
          <Text size="sm" c="dimmed">
            Signed in as {user?.fullName}
          </Text>
        </Stack>
        <Anchor component={Link} href="/products" size="sm" c={semantic.textBrand}>
          <Group gap={4} wrap="nowrap" component="span">
            <IconArrowLeft size={14} aria-hidden />
            Continue shopping
          </Group>
        </Anchor>
      </Group>

      <Grid gap="xl">
        <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
          <Paper withBorder radius="md" p={{ base: "md", sm: "xl" }} bg={semantic.surface} shadow="card">
            <Stepper
              active={active}
              onStepClick={handleStepClick}
              allowNextStepsSelect={false}
              size="sm"
              mb="xl"
            >
              {STEPS.map(({ label, description, icon: Icon }) => (
                <Stepper.Step key={label} label={label} description={description} icon={<Icon size={18} aria-hidden />} />
              ))}
            </Stepper>

            <StepTransition stepKey={active} direction={direction}>
              {active === 0 ? (
                <ShippingStep form={form} onContinue={() => goTo(1)} headingRef={headingRef} />
              ) : null}
              {active === 1 ? (
                <PaymentStep
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  onBack={() => goTo(0)}
                  onContinue={() => goTo(2)}
                  headingRef={headingRef}
                />
              ) : null}
              {active === 2 ? (
                <ReviewStep
                  items={items}
                  address={address}
                  totals={totals}
                  couponCode={couponCode}
                  isRecalculating={isRecalculating}
                  couponBlocked={couponBlocked}
                  isRefreshingPrices={isRefreshingPrices}
                  problem={problem}
                  isPlacing={isPlacing}
                  onEditShipping={() => goTo(0)}
                  onEditPayment={() => goTo(1)}
                  onBack={() => goTo(1)}
                  onPlaceOrder={handlePlaceOrder}
                  onAdjustQuantity={handleAdjustQuantity}
                  onRemoveItem={handleRemoveItem}
                  onRemoveCoupon={() => setCouponCode(null)}
                  headingRef={headingRef}
                />
              ) : null}
            </StepTransition>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
          <Box style={{ position: "sticky", top: 96 }}>
            <Paper withBorder radius="md" p="lg" bg={semantic.surface} shadow="card" component="aside" aria-labelledby="checkout-summary-heading">
              <Group justify="space-between" mb="md">
                <Title order={2} size="h4" id="checkout-summary-heading" c={semantic.text}>
                  Order summary
                </Title>
                <Anchor component="button" type="button" size="sm" onClick={openDrawer}>
                  Edit cart
                </Anchor>
              </Group>

              <Stack
                gap="sm"
                component="ul"
                aria-label="Items in this order"
                m={0}
                p={0}
                style={{ listStyle: "none", maxHeight: 320, overflowY: "auto" }}
              >
                {items.map((item) => (
                  <Box component="li" key={item.id}>
                    <CartLineItem item={item} thumbnailSize={48} />
                  </Box>
                ))}
              </Stack>

              <Divider my="md" color={semantic.borderBrand} />
              <Stack gap="md">
                <FreeDeliveryProgress subtotal={totals.subtotal} />
                <CouponField coupon={coupon} disabled={isPlacing} />
                <Divider color={semantic.borderBrand} />
                <OrderTotals totals={totals} couponCode={couponCode} isRecalculating={isRecalculating} />
              </Stack>
            </Paper>
          </Box>
        </Grid.Col>
      </Grid>
    </Container>
  );
}
