"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, Paper, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAdjustments, IconAlertCircle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { StatusBadge } from "../../StatusBadge";
import { useInventoryMutations } from "../../../hooks/admin/use-batches";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import type { AdminAdjustmentReason, AdminBatchDTO } from "../../../types/admin";
import { formatCalendarDate, formatCount } from "../format";
import { applyApiFieldErrors } from "../form-errors";
import { ModalTitle } from "../products/ModalTitle";

type Direction = "remove" | "add";

/** A type alias (not an interface) so it satisfies the resolver's `Record<string, unknown>`. */
type AdjustFormValues = {
  direction: Direction;
  quantity: number | string;
  reason: AdminAdjustmentReason;
  note: string;
};

function buildSchema(batch: AdminBatchDTO) {
  return z
    .object({
      direction: z.enum(["remove", "add"]),
      quantity: z
        .number({ error: "Enter a quantity" })
        .int("Use a whole number")
        .min(1, "At least 1 unit")
        .max(1_000_000, "Too large"),
      reason: z.enum(["MANUAL_ADJUSTMENT", "EXPIRED_SCRAP"]),
      note: z.string().trim().max(500, "Keep the note under 500 characters"),
    })
    .superRefine((values, ctx) => {
      if (values.direction === "remove" && values.quantity > batch.availableQuantity) {
        ctx.addIssue({
          code: "custom",
          path: ["quantity"],
          message: `Only ${formatCount(batch.availableQuantity)} units are left in this batch`,
        });
      }
      if (values.direction === "add" && values.reason === "EXPIRED_SCRAP") {
        ctx.addIssue({ code: "custom", path: ["reason"], message: "Expired scrap can only remove stock" });
      }
      if (values.direction === "add" && batch.healthStatus === "EXPIRED") {
        ctx.addIssue({ code: "custom", path: ["direction"], message: "Stock can't be added to an expired batch" });
      }
    });
}

export interface AdjustStockModalProps {
  batch: AdminBatchDTO | null;
  onClose: () => void;
}

/** `POST /admin/inventory/adjust` — manual correction or expired-stock write-off for one batch. */
export function AdjustStockModal({ batch, onClose }: AdjustStockModalProps) {
  return (
    <Modal opened={batch !== null} onClose={onClose} title={<ModalTitle icon={<IconAdjustments size={18} />}>Adjust stock</ModalTitle>} size="lg" closeOnClickOutside={false}>
      {batch ? <AdjustStockForm key={batch.id} batch={batch} onClose={onClose} /> : null}
    </Modal>
  );
}

function AdjustStockForm({ batch, onClose }: { batch: AdminBatchDTO; onClose: () => void }) {
  const expired = batch.healthStatus === "EXPIRED";
  const form = useForm<AdjustFormValues>({
    mode: "controlled",
    initialValues: {
      direction: "remove",
      quantity: expired && batch.availableQuantity > 0 ? batch.availableQuantity : "",
      reason: expired ? "EXPIRED_SCRAP" : "MANUAL_ADJUSTMENT",
      note: "",
    },
    validate: zod4Resolver(buildSchema(batch)),
  });
  const { adjustStock } = useInventoryMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const quantity = Number(form.values.quantity) || 0;
  const delta = form.values.direction === "remove" ? -quantity : quantity;
  const projected = batch.availableQuantity + delta;

  const handleSubmit = async (values: AdjustFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      const signedDelta = values.direction === "remove" ? -Number(values.quantity) : Number(values.quantity);
      const result = await adjustStock({
        productId: batch.productId,
        batchId: batch.id,
        delta: signedDelta,
        reason: values.reason,
        note: values.note.trim() || undefined,
      });
      const hidden = result.availabilityChanges.some((change) => change.change === "AUTO_DEACTIVATED");
      const live = result.availabilityChanges.some((change) => change.change === "AUTO_REACTIVATED");
      notifications.show({
        color: "success",
        title: "Stock adjusted",
        message: `${batch.batchNumber}: ${formatCount(result.previousQuantity)} → ${formatCount(result.newQuantity)} units.${
          hidden ? " The product has no sellable stock left and is now hidden." : ""
        }${live ? " The product is live again." : ""}`,
        autoClose: hidden || live ? 8000 : 4000,
      });
      onClose();
    } catch (error) {
      if (isApiError(error) && error.code === "INSUFFICIENT_STOCK") {
        form.setFieldError("quantity", error.message);
      } else if (!applyApiFieldErrors(form, error, ["quantity", "reason", "note", "direction"], { delta: "quantity" })) {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack gap="md">
        <Paper withBorder radius="md" p="sm" bg="var(--mo-color-surface-muted)">
          <Group justify="space-between" wrap="wrap" gap="xs">
            <div>
              <Text fw={600} size="sm">
                {batch.productTitle}
              </Text>
              <Text size="xs" c="dimmed">
                Batch <span style={{ fontFamily: "var(--mo-font-monospace)" }}>{batch.batchNumber}</span> · expires{" "}
                {formatCalendarDate(batch.expiryDate)}
              </Text>
            </div>
            <Group gap="xs">
              <StatusBadge status={batch.healthStatus} size="sm" />
              <Text size="sm" fw={600} className="mo-tabular-nums">
                {formatCount(batch.availableQuantity)} in stock
              </Text>
            </Group>
          </Group>
        </Paper>

        {formError ? (
          <Alert variant="light" color="danger" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} title="Couldn't adjust stock">
            {formError}
          </Alert>
        ) : null}

        <SegmentedControl
          fullWidth
          value={form.values.direction}
          onChange={(value) => {
            const direction: Direction = value === "add" ? "add" : "remove";
            form.setFieldValue("direction", direction);
            if (direction === "add") {
              form.setFieldValue("reason", "MANUAL_ADJUSTMENT");
            }
          }}
          data={[
            { label: "Remove stock", value: "remove" },
            { label: "Add stock", value: "add", disabled: expired },
          ]}
          aria-label="Adjustment direction"
        />
        {form.errors.direction ? (
          <Text size="xs" c="var(--mantine-color-error)">
            {form.errors.direction}
          </Text>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <NumberInput
            label={form.values.direction === "remove" ? "Units to remove" : "Units to add"}
            withAsterisk
            min={1}
            allowDecimal={false}
            allowNegative={false}
            thousandSeparator=","
            {...form.getInputProps("quantity")}
          />
          <Select
            label="Reason"
            allowDeselect={false}
            data={[
              { value: "MANUAL_ADJUSTMENT", label: "Manual adjustment (count correction, damage…)" },
              { value: "EXPIRED_SCRAP", label: "Expired scrap (write-off)", disabled: form.values.direction === "add" },
            ]}
            {...form.getInputProps("reason")}
          />
        </SimpleGrid>
        <Textarea label="Note" placeholder="Why is the stock changing? (recommended)" autosize minRows={2} maxRows={4} {...form.getInputProps("note")} />

        <Text size="sm" c="dimmed" className="mo-tabular-nums">
          {quantity > 0 ? (
            <>
              Batch stock: {formatCount(batch.availableQuantity)} → <strong>{formatCount(Math.max(projected, 0))}</strong> units.
            </>
          ) : (
            "Enter a quantity to preview the new stock level."
          )}
        </Text>

        <Group justify="flex-end" gap="sm">
          <Button radius="xl" variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button radius="xl" type="submit" color={form.values.direction === "remove" ? "danger" : "secondaryGreen"} loading={submitting}>
            {form.values.direction === "remove" ? "Remove stock" : "Add stock"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
