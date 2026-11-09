"use client";

import type { RefObject } from "react";
import { Grid, Group, Select, Stack, Text, TextInput, Title } from "@mantine/core";
import type { FormErrors, UseFormReturnType } from "@mantine/form";
import { IconArrowRight, IconMapPin, IconPhone, IconUser } from "@tabler/icons-react";
import { BrandButton } from "../BrandButton";
import { BD_DISTRICT_SELECT_DATA, bdDistrictFilter } from "../../lib/bd-districts";
import { normalizeBangladeshMobile } from "../../lib/phone";
import { semantic } from "../../tokens";
import { SHIPPING_FIELDS, shippingInputId, type ShippingFormValues } from "./shipping-schema";

export interface ShippingStepProps {
  form: UseFormReturnType<ShippingFormValues>;
  onContinue: () => void;
  headingRef: RefObject<HTMLHeadingElement | null>;
}

/** Moves focus to the first field with an error (in visual order). */
export function focusFirstShippingError(errors: FormErrors): void {
  const field = SHIPPING_FIELDS.find((name) => Boolean(errors[name]));
  if (field) {
    document.getElementById(shippingInputId(field))?.focus();
  }
}

/** Step 1 — delivery address (validated with the shared zod schema). */
export function ShippingStep({ form, onContinue, headingRef }: ShippingStepProps) {
  const field = (name: keyof ShippingFormValues) => ({
    id: shippingInputId(name),
    name,
    ...form.getInputProps(name),
  });

  return (
    <form
      noValidate
      aria-labelledby="checkout-shipping-heading"
      onSubmit={form.onSubmit(() => onContinue(), focusFirstShippingError)}
    >
      <Stack gap="lg">
        <Stack gap={4}>
          <Title order={2} id="checkout-shipping-heading" ref={headingRef} tabIndex={-1} size="h3" c={semantic.text}>
            Delivery address
          </Title>
          <Text size="sm" c="dimmed">
            Where should we deliver your order? Fields marked * are required.
          </Text>
        </Stack>

        <Grid gap="md">
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              {...field("fullName")}
              label="Recipient's full name"
              placeholder="e.g. Fatema Begum"
              autoComplete="name"
              withAsterisk
              leftSection={<IconUser size={16} aria-hidden />}
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              {...field("phone")}
              type="tel"
              inputMode="tel"
              label="Mobile number"
              description="Bangladeshi mobile number for the courier"
              placeholder="01XXXXXXXXX"
              autoComplete="tel"
              withAsterisk
              leftSection={<IconPhone size={16} aria-hidden />}
              onBlur={(event) => {
                const normalized = normalizeBangladeshMobile(event.currentTarget.value);
                if (normalized) {
                  form.setFieldValue("phone", normalized);
                }
                form.getInputProps("phone").onBlur?.(event);
              }}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              {...field("addressLine1")}
              label="Address"
              placeholder="House, road, area — e.g. House 12, Road 4, Dhanmondi"
              autoComplete="address-line1"
              withAsterisk
              leftSection={<IconMapPin size={16} aria-hidden />}
            />
          </Grid.Col>
          <Grid.Col span={12}>
            <TextInput
              {...field("addressLine2")}
              label="Apartment, floor or landmark"
              placeholder="Optional — e.g. Flat 5B, near the mosque"
              autoComplete="address-line2"
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              {...field("city")}
              label="City / area"
              placeholder="e.g. Dhanmondi"
              autoComplete="address-level2"
              withAsterisk
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <Select
              {...field("district")}
              // Clearing yields null; the form keeps strings only.
              onChange={(value) => form.setFieldValue("district", value ?? "")}
              label="District"
              placeholder="Search 64 districts"
              data={BD_DISTRICT_SELECT_DATA}
              filter={bdDistrictFilter}
              searchable
              clearable
              nothingFoundMessage="No district matches — check the spelling"
              maxDropdownHeight={280}
              comboboxProps={{ shadow: "dropdown" }}
              autoComplete="off"
              withAsterisk
            />
          </Grid.Col>
          <Grid.Col span={{ base: 12, sm: 6 }}>
            <TextInput
              {...field("postalCode")}
              label="Postcode"
              placeholder="e.g. 1205"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={4}
              withAsterisk
            />
          </Grid.Col>
        </Grid>

        <Group justify="flex-end">
          <BrandButton type="submit" size="md" rightSection={<IconArrowRight size={18} aria-hidden />}>
            Continue to payment
          </BrandButton>
        </Group>
      </Stack>
    </form>
  );
}
