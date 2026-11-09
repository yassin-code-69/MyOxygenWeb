"use client";

import { useMemo, useState } from "react";
import { Alert, Autocomplete, Box, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconArrowMerge, IconInfoCircle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { useBrandMutations } from "../../../hooks/admin/use-brands";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import type { AdminBrand } from "../../../types/admin-management";
import { applyApiFieldErrors } from "../form-errors";
import { formatCount, pluralize } from "../format";
import { caseVariants } from "./brand-utils";

/** A type alias so it satisfies the resolver's `Record<string, unknown>`. */
type RenameFormValues = { to: string };

/** Mirrors `renameBrandSchema` (backend/src/routes/admin.catalog-meta.ts) and the service's "must differ" rule. */
function buildSchema(from: string) {
  return z.object({
    to: z
      .string()
      .trim()
      .min(1, "Enter the new brand name")
      .max(120, "Keep the name under 120 characters")
      .refine((value) => value !== from, "Type a different name (a change of capitals counts)"),
  });
}

export interface RenameBrandModalProps {
  /** The brand to rename; `null` keeps the modal closed. */
  brand: AdminBrand | null;
  brands: readonly AdminBrand[];
  onClose: () => void;
}

/**
 * Rename a brand on every product, or merge it into an existing brand by
 * picking that name (`PATCH /admin/catalog/brands`). The API matches the
 * old name case-insensitively, so spelling variants that differ only in
 * capitals move too — the modal says so up front.
 */
export function RenameBrandModal({ brand, brands, onClose }: RenameBrandModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      opened={brand !== null}
      onClose={busy ? () => undefined : onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      title={<Text fw={700}>Rename or merge brand</Text>}
      radius="md"
      centered
    >
      {brand ? <RenameBrandForm key={brand.name} brand={brand} brands={brands} onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function RenameBrandForm({
  brand,
  brands,
  onClose,
  onBusyChange,
}: {
  brand: AdminBrand;
  brands: readonly AdminBrand[];
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { renameBrand } = useBrandMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<RenameFormValues>({
    mode: "controlled",
    initialValues: { to: brand.name },
    validate: zod4Resolver(buildSchema(brand.name)),
  });

  const variants = useMemo(() => caseVariants(brands, brand.name), [brands, brand.name]);
  const affected = brand.productCount + variants.reduce((sum, variant) => sum + variant.productCount, 0);
  const target = form.values.to.trim();
  const mergeInto = useMemo(
    () => (target === "" ? undefined : brands.find((other) => other.name === target && other.name.toLowerCase() !== brand.name.toLowerCase())),
    [brands, brand.name, target],
  );
  const suggestions = useMemo(
    () => brands.filter((other) => other.name !== brand.name).map((other) => other.name),
    [brands, brand.name],
  );

  const submit = form.onSubmit(async (values) => {
    setFormError(null);
    setSubmitting(true);
    onBusyChange(true);
    try {
      const result = await renameBrand({ from: brand.name, to: values.to.trim() });
      notifications.show({
        color: "success",
        title: mergeInto ? "Brands merged" : "Brand renamed",
        message: `“${values.to.trim()}” is now set on ${pluralize(result.updated, "product")}.`,
      });
      onClose();
    } catch (error) {
      const mapped = applyApiFieldErrors(form, error, ["to"]);
      if (!mapped) {
        setFormError(
          isApiError(error) && error.status === 404
            ? `No product uses “${brand.name}” any more — the list may be out of date. Close this and refresh.`
            : getErrorMessage(error),
        );
      }
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        {formError ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
            {formError}
          </Alert>
        ) : null}

        <Box p="sm" style={{ borderRadius: "var(--mo-radius-md)", backgroundColor: "var(--mo-color-surface-muted)" }}>
          <Text size="xs" c="var(--mo-color-text-muted)" fw={600}>
            Current name
          </Text>
          <Text fw={600}>{brand.name}</Text>
          <Text size="xs" c="var(--mo-color-text-muted)">
            {pluralize(brand.productCount, "product")} · {formatCount(brand.activeProductCount)} active
          </Text>
        </Box>

        <Autocomplete
          label="New name"
          description="Type a new name, or pick an existing brand to merge into it."
          placeholder="e.g. Johnson's"
          data={suggestions}
          limit={8}
          withAsterisk
          data-autofocus
          comboboxProps={{ withinPortal: true }}
          {...form.getInputProps("to")}
        />

        {mergeInto ? (
          <Alert color="info" variant="light" radius="md" icon={<IconArrowMerge size={18} aria-hidden />} title="This merges two brands">
            “{mergeInto.name}” already has {pluralize(mergeInto.productCount, "product")}. All {pluralize(affected, "product")} of “{brand.name}” will move to
            it and “{brand.name}” disappears from the list.
          </Alert>
        ) : null}

        {variants.length > 0 ? (
          <Alert color="warning" variant="light" radius="md" icon={<IconInfoCircle size={18} aria-hidden />}>
            Names are matched without regard to capitals, so {variants.map((variant) => `“${variant.name}”`).join(", ")} (
            {pluralize(affected - brand.productCount, "product")}) will be renamed too.
          </Alert>
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" radius="xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" color="secondaryGreen.8" radius="xl" loading={submitting}>
            {mergeInto ? "Merge brands" : "Rename brand"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
