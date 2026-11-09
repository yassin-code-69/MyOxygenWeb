"use client";

import type { ReactNode, RefObject } from "react";
import { Badge, Group, Radio, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconArrowLeft, IconArrowRight, IconCash, IconCreditCard } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { semantic } from "../../tokens";
import type { PaymentMethod } from "../../types/order";

export interface PaymentStepProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  onBack: () => void;
  onContinue: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

interface PaymentOptionProps {
  value: PaymentMethod;
  checked: boolean;
  disabled?: boolean;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  description: ReactNode;
}

function PaymentOption({ value, checked, disabled = false, icon, title, badge, description }: PaymentOptionProps) {
  return (
    <Radio.Card
      value={value}
      disabled={disabled}
      radius="md"
      p="md"
      aria-describedby={`payment-${value}-description`}
      style={{
        borderColor: checked ? "var(--mantine-color-primaryPink-6)" : semantic.border,
        backgroundColor: disabled ? semantic.surfaceMuted : checked ? semantic.surfaceBrandTint : semantic.surface,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <Group wrap="nowrap" align="flex-start" gap="md">
        <Radio.Indicator disabled={disabled} mt={4} />
        <ThemeIcon variant="light" color={disabled ? "gray" : "primaryPink"} radius="xl" size={40}>
          {icon}
        </ThemeIcon>
        <Stack gap={4} style={{ flex: 1 }}>
          <Group gap="xs">
            <Text fw={700} c={disabled ? semantic.textSecondary : semantic.text}>
              {title}
            </Text>
            {badge}
          </Group>
          <Text size="sm" c={semantic.textSecondary} id={`payment-${value}-description`}>
            {description}
          </Text>
        </Stack>
      </Group>
    </Radio.Card>
  );
}

/**
 * Step 2 — payment method. Only cash on delivery can be taken today: no online
 * payment gateway is integrated, so that option is shown but disabled.
 */
export function PaymentStep({ value, onChange, onBack, onContinue, headingRef }: PaymentStepProps) {
  return (
    <Stack gap="lg">
      <Stack gap={4}>
        <Title order={2} id="checkout-payment-heading" ref={headingRef} tabIndex={-1} size="h3" c={semantic.text}>
          Payment method
        </Title>
        <Text size="sm" c="dimmed">
          Choose how you&apos;d like to pay for this order.
        </Text>
      </Stack>

      <Radio.Group
        value={value}
        onChange={(next) => {
          if (next === "COD") {
            onChange(next);
          }
        }}
        aria-labelledby="checkout-payment-heading"
      >
        <Stack gap="sm">
          <PaymentOption
            value="COD"
            checked={value === "COD"}
            icon={<IconCash size={20} aria-hidden />}
            title="Cash on delivery"
            badge={
              <Badge color="secondaryGreen" variant="light" size="sm">
                Available
              </Badge>
            }
            description="Pay the courier in cash when your order arrives. No advance payment needed."
          />
          <PaymentOption
            value="ONLINE_GATEWAY"
            checked={false}
            disabled
            icon={<IconCreditCard size={20} aria-hidden />}
            title="Online payment (bKash, Nagad, cards)"
            badge={
              <Badge color="gray" variant="light" size="sm">
                Not available yet
              </Badge>
            }
            description="We haven't connected an online payment gateway yet, so we can't take card or mobile-wallet payments. Please use cash on delivery for now."
          />
        </Stack>
      </Radio.Group>

      <Group justify="space-between">
        <BrandButton variant="ghost" onClick={onBack} leftSection={<IconArrowLeft size={18} aria-hidden />}>
          Back
        </BrandButton>
        <BrandButton onClick={onContinue} size="md" rightSection={<IconArrowRight size={18} aria-hidden />}>
          Review order
        </BrandButton>
      </Group>
    </Stack>
  );
}
