"use client";

import { useId, useState, type FormEvent } from "react";
import { ActionIcon, Box, Button, Group, Loader, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertTriangle, IconRefresh, IconTicket, IconX } from "@tabler/icons-react";
import { formatBDT } from "../../lib/format";
import { getErrorMessage } from "../../lib/api-client";
import { dropUnavailableProducts, unavailableProductIdsOf, type UseCouponPreviewResult } from "../../hooks/checkout/use-coupon-preview";
import { brand, semantic } from "../../tokens";

export interface CouponFieldProps {
  coupon: UseCouponPreviewResult;
  /** Disable entry (e.g. while an order is being placed). */
  disabled?: boolean;
}

/**
 * Coupon entry with validation states. Applying calls `POST /orders/validate-coupon`
 * for the current cart; the applied state always reflects the live preview.
 */
export function CouponField({ coupon, disabled = false }: CouponFieldProps) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const { couponCode, preview, isRecalculating, error: previewError } = coupon;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = value.trim().toUpperCase();
    if (code === "") {
      setError("Enter a coupon code.");
      return;
    }
    if (code.length > 64) {
      setError("That code is too long.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const result = await coupon.apply(code);
      if (!result.valid) {
        setError(result.reason ?? "This coupon can't be used for your cart.");
        return;
      }
      setValue("");
      notifications.show({
        color: "success",
        title: `Coupon ${result.code} applied`,
        message: `You save ${formatBDT(result.discountAmount)} on this order.`,
      });
    } catch (applyError) {
      const unavailable = unavailableProductIdsOf(applyError);
      if (unavailable.length > 0) {
        dropUnavailableProducts(unavailable);
        setError("Some items are no longer available. Try the coupon again.");
      } else {
        setError(getErrorMessage(applyError, "We couldn't check this coupon. Please try again."));
      }
    } finally {
      setApplying(false);
    }
  };

  if (couponCode) {
    return (
      <Box
        p="sm"
        style={{
          borderRadius: "var(--mantine-radius-md)",
          border: `1px dashed ${previewError ? semantic.borderStrong : brand.secondary}`,
          backgroundColor: previewError ? semantic.surfaceMuted : semantic.surfaceSuccessTint,
        }}
      >
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Group gap={8} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconTicket size={18} color={brand.secondary} aria-hidden />
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm" fw={700} c={semantic.text}>
                {couponCode}
              </Text>
              <Text size="xs" c={semantic.textSecondary} aria-live="polite">
                {isRecalculating
                  ? "Checking the discount for your updated cart…"
                  : previewError
                    ? "We couldn't re-check this coupon."
                    : preview
                      ? `Applied — you save ${formatBDT(preview.discountAmount)}`
                      : "Applied"}
              </Text>
            </Stack>
          </Group>
          <Group gap={4} wrap="nowrap">
            {isRecalculating ? <Loader size="xs" aria-hidden /> : null}
            {previewError ? (
              <Tooltip label="Check again">
                <ActionIcon variant="subtle" color="gray" onClick={coupon.retry} aria-label={`Check coupon ${couponCode} again`}>
                  <IconRefresh size={16} aria-hidden />
                </ActionIcon>
              </Tooltip>
            ) : null}
            <Tooltip label="Remove coupon">
              <ActionIcon
                variant="subtle"
                color="gray"
                onClick={coupon.remove}
                disabled={disabled}
                aria-label={`Remove coupon ${couponCode}`}
              >
                <IconX size={16} aria-hidden />
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
        {previewError ? (
          <Group gap={6} mt={6} wrap="nowrap" align="flex-start">
            <IconAlertTriangle size={14} color={brand.warning} aria-hidden style={{ marginTop: 2, flexShrink: 0 }} />
            <Text size="xs" c={semantic.textSecondary}>
              {getErrorMessage(previewError)} The discount isn&apos;t shown until it&apos;s confirmed.
            </Text>
          </Group>
        ) : null}
      </Box>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-label="Apply a coupon">
      <Group align="flex-start" gap="xs" wrap="nowrap">
        <TextInput
          id={inputId}
          label="Coupon code"
          placeholder="e.g. WELCOME10"
          value={value}
          onChange={(event) => {
            setValue(event.currentTarget.value.toUpperCase());
            if (error) {
              setError(null);
            }
          }}
          error={error}
          disabled={disabled || applying}
          radius="xl"
          size="sm"
          maxLength={64}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          leftSection={<IconTicket size={16} aria-hidden />}
          style={{ flex: 1 }}
        />
        <Button
          type="submit"
          variant="outline"
          color="primaryPink"
          radius="xl"
          size="sm"
          mt={25}
          loading={applying}
          disabled={disabled}
        >
          Apply
        </Button>
      </Group>
    </form>
  );
}
