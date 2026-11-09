"use client";

import { useState } from "react";
import { Alert, Button, Group, List, Modal, NumberInput, SimpleGrid, Stack, Text, TextInput, Textarea, ThemeIcon } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCalendar, IconCircleCheck, IconInfoCircle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { useInventoryMutations } from "../../../hooks/admin/use-batches";
import { getErrorMessage } from "../../../lib/api-client";
import type { AdminImportBatchPayload, AdminImportBatchResult } from "../../../types/admin";
import { addDaysToCalendarDate, formatCalendarDate, formatCount, todayInDhaka } from "../format";
import { applyApiFieldErrors } from "../form-errors";
import { ProductPicker, type ProductOption } from "../ProductPicker";

/** A type alias (not an interface) so it satisfies the resolver's `Record<string, unknown>`. */
type ImportFormValues = {
  productId: string | null;
  batchNumber: string;
  manufactureDate: string | null;
  expiryDate: string | null;
  initialQuantity: number | string;
  note: string;
};

const FIELDS = ["productId", "batchNumber", "manufactureDate", "expiryDate", "initialQuantity", "note"] as const;

/** Mirrors `importBatchSchema` (backend/src/routes/inventory.schema.ts); "today" is the Dhaka calendar day. */
function buildSchema(today: string) {
  return z
    .object({
      productId: z.string({ error: "Choose a product" }).min(1, "Choose a product"),
      batchNumber: z
        .string()
        .trim()
        .min(2, "Batch number must be at least 2 characters")
        .max(64, "Batch number must be at most 64 characters")
        .regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/, "Use letters, digits, '.', '_', '/' and '-'"),
      manufactureDate: z.string().nullable(),
      expiryDate: z.string({ error: "Pick the expiry date" }).min(1, "Pick the expiry date"),
      initialQuantity: z
        .number({ error: "Enter how many units arrived" })
        .int("Use a whole number")
        .min(1, "At least 1 unit")
        .max(1_000_000, "That's more than 1,000,000 units"),
      note: z.string().trim().max(500, "Keep the note under 500 characters"),
    })
    .superRefine((values, ctx) => {
      if (values.expiryDate && values.expiryDate <= today) {
        ctx.addIssue({ code: "custom", path: ["expiryDate"], message: "Expiry must be after today" });
      }
      if (values.manufactureDate) {
        if (values.manufactureDate > today) {
          ctx.addIssue({ code: "custom", path: ["manufactureDate"], message: "Manufacture date can't be in the future" });
        }
        if (values.expiryDate && values.manufactureDate >= values.expiryDate) {
          ctx.addIssue({ code: "custom", path: ["manufactureDate"], message: "Must be before the expiry date" });
        }
      }
    });
}

export interface ImportBatchModalProps {
  opened: boolean;
  onClose: () => void;
  /** Preselected product (e.g. from "Import batch" on the products page). */
  initialProduct?: ProductOption | null;
}

/** `POST /admin/inventory/batches` — receive a new batch of stock. */
export function ImportBatchModal({ opened, onClose, initialProduct = null }: ImportBatchModalProps) {
  const [formKey, setFormKey] = useState(0);
  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={<Text fw={700}>Import a batch</Text>} closeOnClickOutside={false}>
      {opened ? (
        <ImportBatchForm
          key={`${formKey}-${initialProduct?.id ?? "none"}`}
          initialProduct={initialProduct}
          onClose={onClose}
          onImportAnother={() => setFormKey((value) => value + 1)}
        />
      ) : null}
    </Modal>
  );
}

function ImportBatchForm({
  initialProduct,
  onClose,
  onImportAnother,
}: {
  initialProduct: ProductOption | null;
  onClose: () => void;
  onImportAnother: () => void;
}) {
  const today = todayInDhaka();
  const form = useForm<ImportFormValues>({
    mode: "controlled",
    initialValues: {
      productId: initialProduct?.id ?? null,
      batchNumber: "",
      manufactureDate: null,
      expiryDate: null,
      initialQuantity: "",
      note: "",
    },
    validate: zod4Resolver(buildSchema(today)),
  });
  const { importBatch } = useInventoryMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<AdminImportBatchResult | null>(null);

  const handleSubmit = async (values: ImportFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: AdminImportBatchPayload = {
        productId: values.productId ?? "",
        batchNumber: values.batchNumber.trim(),
        manufactureDate: values.manufactureDate,
        expiryDate: values.expiryDate ?? "",
        initialQuantity: Number(values.initialQuantity),
      };
      if (values.note.trim()) {
        payload.note = values.note.trim();
      }
      const imported = await importBatch(payload);
      setResult(imported);
      notifications.show({
        color: "success",
        title: "Batch imported",
        message: `${imported.batch.batchNumber}: ${formatCount(imported.batch.initialQuantity)} units of ${imported.batch.productTitle}.`,
      });
    } catch (error) {
      if (!applyApiFieldErrors(form, error, FIELDS)) {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const wentLive = result.availabilityChanges.some(
      (change) => change.productId === result.product.id && change.change === "AUTO_REACTIVATED",
    );
    return (
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size={40} radius="xl" color="success" variant="light">
            <IconCircleCheck size={22} aria-hidden />
          </ThemeIcon>
          <div>
            <Text fw={700}>Batch {result.batch.batchNumber} imported</Text>
            <Text size="sm" c="dimmed">
              {formatCount(result.batch.initialQuantity)} units of {result.batch.productTitle}, expiring{" "}
              {formatCalendarDate(result.batch.expiryDate)}.
            </Text>
          </div>
        </Group>
        <List size="sm" spacing={4}>
          <List.Item>
            Total stock for {result.product.title} is now <strong>{formatCount(result.product.totalStock)}</strong>.
          </List.Item>
          <List.Item>Recorded in the stock ledger as an import.</List.Item>
        </List>
        {wentLive ? (
          <Alert color="success" variant="light" radius="md" icon={<IconCircleCheck size={18} aria-hidden />} title="Product is now live">
            {result.product.title} had no sellable stock and is back on the storefront.
          </Alert>
        ) : null}
        {result.product.listingStatus === "INACTIVE" ? (
          <Alert color="warning" variant="light" radius="md" icon={<IconInfoCircle size={18} aria-hidden />} title="Still hidden">
            This product was deactivated by an admin, so it stays off the storefront until someone reactivates it on the
            Products page.
          </Alert>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onImportAnother}>
            Import another
          </Button>
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack gap="md">
        {formError ? (
          <Alert variant="light" color="danger" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} title="Couldn't import the batch">
            {formError}
          </Alert>
        ) : null}
        <ProductPicker
          withAsterisk
          value={form.values.productId}
          onChange={(id) => form.setFieldValue("productId", id)}
          error={form.errors.productId}
          initialProduct={initialProduct}
          description="Includes products awaiting stock and inactive ones."
        />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput
            label="Batch number"
            withAsterisk
            placeholder="e.g. LOT-2026-11-A"
            description="As printed on the packaging."
            {...form.getInputProps("batchNumber")}
          />
          <NumberInput
            label="Quantity received"
            withAsterisk
            min={1}
            max={1_000_000}
            allowDecimal={false}
            allowNegative={false}
            thousandSeparator=","
            {...form.getInputProps("initialQuantity")}
          />
          <DatePickerInput
            label="Manufacture date"
            placeholder="Optional"
            clearable
            maxDate={today}
            valueFormat="D MMM YYYY"
            leftSection={<IconCalendar size={16} aria-hidden />}
            {...form.getInputProps("manufactureDate")}
          />
          <DatePickerInput
            label="Expiry date"
            withAsterisk
            placeholder="Pick a date"
            minDate={addDaysToCalendarDate(today, 1)}
            valueFormat="D MMM YYYY"
            leftSection={<IconCalendar size={16} aria-hidden />}
            {...form.getInputProps("expiryDate")}
          />
        </SimpleGrid>
        <Textarea label="Note" placeholder="Supplier, invoice number… (optional)" autosize minRows={2} maxRows={4} {...form.getInputProps("note")} />
        <Text size="xs" c="dimmed">
          Dates are calendar days in Dhaka. Stock is sold first-expired, first-out, and a product awaiting stock goes live
          automatically once this batch is in.
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" color="secondaryGreen" loading={submitting}>
            Import batch
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
