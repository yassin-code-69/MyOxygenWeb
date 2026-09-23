"use client";

import React, { useState } from "react";
import {
  Drawer,
  Box,
  Text,
  Group,
  Stack,
  Button,
  ActionIcon,
  Image,
  Progress,
  TextInput,
  Badge,
  Divider,
  ScrollArea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconTrash,
  IconPlus,
  IconMinus,
  IconShoppingBag,
  IconTruckDelivery,
  IconTag,
  IconX,
  IconArrowRight,
  IconCalendarTime,
} from "@tabler/icons-react";
import Link from "next/link";
import { useCartStore } from "../lib/cart-store";
import { apiPost } from "../lib/api-client";
import { myOxygenColors } from "../tokens";
import { BrandButton } from "./BrandButton";

export function CartDrawer() {
  const isDrawerOpen = useCartStore((state) => state.isDrawerOpen);
  const closeDrawer = useCartStore((state) => state.closeDrawer);
  const items = useCartStore((state) => state.items);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const removeItem = useCartStore((state) => state.removeItem);
  const appliedCoupon = useCartStore((state) => state.appliedCoupon);
  const setAppliedCoupon = useCartStore((state) => state.setAppliedCoupon);

  const subtotal = useCartStore((state) => state.subtotal());
  const shippingFee = useCartStore((state) => state.shippingFee());
  const amountNeeded = useCartStore((state) => state.amountNeededForFreeDelivery());
  const finalTotal = useCartStore((state) => state.finalTotal());

  const [couponCode, setCouponCode] = useState("");
  const [isValidatingCoupon, setIsValidatingCoupon] = useState(false);

  // Progress for free delivery (threshold ৳1500)
  const deliveryProgress = Math.min(100, Math.round((subtotal / 1500) * 100));

  const handleApplyCoupon = async () => {
    const trimmed = couponCode.trim();
    if (!trimmed) {
      notifications.show({
        title: "Coupon code required",
        message: "Please enter a valid coupon code.",
        color: "red",
      });
      return;
    }

    if (items.length === 0) {
      notifications.show({
        title: "Cart is empty",
        message: "Add items to your cart before applying a coupon.",
        color: "orange",
      });
      return;
    }

    setIsValidatingCoupon(true);
    try {
      const res = await apiPost<{
        success: boolean;
        data: {
          isValid: boolean;
          discountAmount: number;
          code: string;
          type?: "PERCENTAGE" | "FIXED_AMOUNT";
          value?: number;
        };
        error?: string;
      }>("/orders/validate-coupon", {
        code: trimmed,
        items: items.map((i) => ({ productId: i.id, quantity: i.quantity })),
      });

      if (res.success && res.data?.isValid) {
        setAppliedCoupon({
          code: res.data.code,
          discountAmount: res.data.discountAmount,
          type: res.data.type,
          value: res.data.value,
        });
        notifications.show({
          title: "Coupon Applied!",
          message: `Saved ৳${res.data.discountAmount.toLocaleString()} with code ${res.data.code}`,
          color: "teal",
        });
        setCouponCode("");
      } else {
        throw new Error(res.error || "Invalid coupon code");
      }
    } catch (err: any) {
      notifications.show({
        title: "Coupon Failed",
        message: err.message || "Invalid or expired coupon code",
        color: "red",
      });
    } finally {
      setIsValidatingCoupon(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    notifications.show({
      title: "Coupon Removed",
      message: "The coupon discount has been removed.",
      color: "gray",
    });
  };

  return (
    <Drawer
      opened={isDrawerOpen}
      onClose={closeDrawer}
      position="right"
      size="md"
      title={
        <Group gap="xs">
          <IconShoppingBag size={22} color={myOxygenColors.primaryPink} />
          <Text fw={700} size="lg" style={{ fontFamily: "var(--font-poppins)" }}>
            Your Shopping Cart ({items.length})
          </Text>
        </Group>
      }
      styles={{
        header: {
          borderBottom: "1px solid #F3F4F6",
          paddingBottom: 16,
        },
        body: {
          display: "flex",
          flexDirection: "column",
          height: "calc(100% - 65px)",
          padding: 0,
        },
      }}
    >
      {/* Free Delivery Bar */}
      <Box p="md" style={{ backgroundColor: "#FFF8F6", borderBottom: "1px solid #FFE4E6" }}>
        <Group justify="space-between" mb={6}>
          <Group gap={6}>
            <IconTruckDelivery size={18} color={amountNeeded === 0 ? "#4CAF7D" : "#FF6B8B"} />
            <Text size="xs" fw={600} c={amountNeeded === 0 ? "#2C7A52" : "#8A3C4D"}>
              {amountNeeded === 0 ? (
                "🎉 You unlocked FREE Delivery across Bangladesh!"
              ) : (
                <>Add <b>৳{amountNeeded.toLocaleString()}</b> more for FREE Delivery</>
              )}
            </Text>
          </Group>
          <Text size="xs" fw={700} c="dimmed">
            {deliveryProgress}%
          </Text>
        </Group>
        <Progress
          value={deliveryProgress}
          color={amountNeeded === 0 ? "teal" : "primaryPink"}
          size="sm"
          radius="xl"
          animated={amountNeeded > 0 && amountNeeded < 1500}
        />
      </Box>

      {/* Cart Content Area */}
      {items.length === 0 ? (
        <Box
          p="xl"
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <Box
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              backgroundColor: "#FFF0F3",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: myOxygenColors.primaryPink,
              marginBottom: 16,
            }}
          >
            <IconShoppingBag size={36} />
          </Box>
          <Text fw={700} size="lg" c={myOxygenColors.darkText}>
            Your cart is empty
          </Text>
          <Text size="sm" c="dimmed" mt={4} maw={260}>
            Looks like you haven&apos;t added any essentials for mother or baby yet.
          </Text>
          <Button
            component={Link}
            href="/products"
            onClick={closeDrawer}
            mt="lg"
            radius="xl"
            color="primaryPink"
          >
            Browse Products
          </Button>
        </Box>
      ) : (
        <ScrollArea style={{ flex: 1 }} p="md">
          <Stack gap="md">
            {items.map((item) => (
              <Box
                key={item.id}
                p="sm"
                style={{
                  border: "1px solid #F3F4F6",
                  borderRadius: 12,
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.02)",
                }}
              >
                <Group align="flex-start" wrap="nowrap" gap="sm">
                  {/* Item Image */}
                  <Box
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 8,
                      overflow: "hidden",
                      flexShrink: 0,
                      backgroundColor: "#F9FAFB",
                    }}
                  >
                    <Image
                      src={item.image}
                      alt={item.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </Box>

                  {/* Title & Expiry */}
                  <Box style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      size="sm"
                      fw={600}
                      lineClamp={1}
                      component={Link}
                      href={`/products/${item.slug}`}
                      onClick={closeDrawer}
                      c={myOxygenColors.darkText}
                      style={{ textDecoration: "none" }}
                    >
                      {item.title}
                    </Text>

                    {item.requiresBatchTracking && item.earliestExpiry && (
                      <Badge
                        size="xs"
                        variant="light"
                        color="teal"
                        mt={3}
                        leftSection={<IconCalendarTime size={10} />}
                        style={{ textTransform: "none", fontWeight: 600 }}
                      >
                        Exp: {item.earliestExpiry}
                      </Badge>
                    )}

                    <Group justify="space-between" align="center" mt={6}>
                      <Text size="sm" fw={700} c={myOxygenColors.primaryPink}>
                        ৳ {item.unitPrice.toLocaleString()}
                      </Text>

                      {/* Quantity Stepper */}
                      <Group gap={4} align="center">
                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="gray"
                          radius="md"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          <IconMinus size={12} />
                        </ActionIcon>

                        <Text size="xs" fw={700} style={{ minWidth: 20, textAlign: "center" }}>
                          {item.quantity}
                        </Text>

                        <ActionIcon
                          size="sm"
                          variant="light"
                          color="gray"
                          radius="md"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          disabled={item.maxStock !== undefined && item.quantity >= item.maxStock}
                          aria-label="Increase quantity"
                        >
                          <IconPlus size={12} />
                        </ActionIcon>

                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color="red"
                          radius="md"
                          ml={4}
                          onClick={() => removeItem(item.id)}
                          aria-label="Remove item"
                        >
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Group>
                    </Group>
                  </Box>
                </Group>
              </Box>
            ))}
          </Stack>
        </ScrollArea>
      )}

      {/* Drawer Footer (Summary & Checkout) */}
      {items.length > 0 && (
        <Box
          p="md"
          style={{
            borderTop: "1px solid #F3F4F6",
            backgroundColor: "#FAFAFA",
          }}
        >
          {/* Coupon Code Input */}
          {appliedCoupon ? (
            <Group
              justify="space-between"
              p="xs"
              mb="sm"
              style={{
                backgroundColor: "#E8F8F0",
                borderRadius: 8,
                border: "1px dashed #4CAF7D",
              }}
            >
              <Group gap={6}>
                <IconTag size={16} color="#4CAF7D" />
                <Text size="xs" fw={700} c="#2C7A52">
                  {appliedCoupon.code} (-৳{appliedCoupon.discountAmount.toLocaleString()})
                </Text>
              </Group>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={handleRemoveCoupon}
                aria-label="Remove coupon"
              >
                <IconX size={14} />
              </ActionIcon>
            </Group>
          ) : (
            <Group gap="xs" mb="sm">
              <TextInput
                placeholder="Coupon code"
                size="xs"
                value={couponCode}
                onChange={(e) => setCouponCode(e.currentTarget.value.toUpperCase())}
                style={{ flex: 1 }}
                leftSection={<IconTag size={14} />}
              />
              <Button
                size="xs"
                variant="outline"
                color="primaryPink"
                radius="md"
                onClick={handleApplyCoupon}
                loading={isValidatingCoupon}
              >
                Apply
              </Button>
            </Group>
          )}

          {/* Breakdown */}
          <Stack gap={4} mb="md">
            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Subtotal
              </Text>
              <Text size="xs" fw={600} c={myOxygenColors.darkText}>
                ৳ {subtotal.toLocaleString()}
              </Text>
            </Group>

            <Group justify="space-between">
              <Text size="xs" c="dimmed">
                Delivery Fee
              </Text>
              <Text
                size="xs"
                fw={600}
                c={shippingFee === 0 ? "teal" : myOxygenColors.darkText}
              >
                {shippingFee === 0 ? "FREE" : `৳ ${shippingFee}`}
              </Text>
            </Group>

            {appliedCoupon && (
              <Group justify="space-between">
                <Text size="xs" c="teal" fw={600}>
                  Coupon Discount
                </Text>
                <Text size="xs" fw={700} c="teal">
                  -৳ {appliedCoupon.discountAmount.toLocaleString()}
                </Text>
              </Group>
            )}

            <Divider my={4} />

            <Group justify="space-between">
              <Text size="sm" fw={700} c={myOxygenColors.darkText}>
                Total
              </Text>
              <Text size="md" fw={800} c={myOxygenColors.primaryPink}>
                ৳ {finalTotal.toLocaleString()}
              </Text>
            </Group>
          </Stack>

          {/* Checkout CTA */}
          <BrandButton
            component={Link}
            href="/checkout"
            onClick={closeDrawer}
            variant="primary"
            fullWidth
            size="md"
            radius="xl"
            rightSection={<IconArrowRight size={18} />}
          >
            Proceed to Checkout
          </BrandButton>
        </Box>
      )}
    </Drawer>
  );
}
