"use client";

import { useState } from "react";
import { Group, Paper, Stack, Text, TextInput } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useInventoryMutations } from "../../../hooks/admin/use-batches";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import type { AdminBatchDTO } from "../../../types/admin";
import { ConfirmModal } from "../ConfirmModal";
import { formatCalendarDate, formatCount, formatMoney } from "../format";

export interface ScrapBatchModalProps {
  /** The expired batch to write off; `null` closes the modal. */
  batch: AdminBatchDTO | null;
  /** Landed cost per unit, when known (for the value shown). */
  unitCost: number | null;
  onClose: () => void;
}

/**
 * Writes off every remaining unit of an expired batch:
 * `POST /admin/inventory/adjust` with `reason: EXPIRED_SCRAP` and a negative
 * delta (STOCK_ADJUST). The ledger records it; it cannot be undone.
 */
export function ScrapBatchModal({ batch, unitCost, onClose }: ScrapBatchModalProps) {
  return batch ? <ScrapBatchConfirm key={batch.id} batch={batch} unitCost={unitCost} onClose={onClose} /> : null;
}

function ScrapBatchConfirm({ batch, unitCost, onClose }: { batch: AdminBatchDTO; unitCost: number | null; onClose: () => void }) {
  const { adjustStock } = useInventoryMutations();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const units = batch.availableQuantity;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adjustStock({
        productId: batch.productId,
        batchId: batch.id,
        delta: -units,
        reason: "EXPIRED_SCRAP",
        note: note.trim() || `Expired on ${formatCalendarDate(batch.expiryDate)}: written off from the Expiry page`,
      });
      const hidden = result.availabilityChanges.some((change) => change.change === "AUTO_DEACTIVATED");
      notifications.show({
        color: "success",
        title: "Expired stock written off",
        message: `${batch.productTitle} · ${batch.batchNumber}: ${formatCount(result.previousQuantity)} → ${formatCount(result.newQuantity)} units.${
          hidden ? " The product has no sellable stock left and is now hidden." : ""
        }`,
        autoClose: hidden ? 8000 : 5000,
      });
      onClose();
    } catch (cause) {
      setError(
        isApiError(cause) && cause.code === "INSUFFICIENT_STOCK"
          ? "The batch changed since this page loaded. Close this dialog; the list has been refreshed."
          : getErrorMessage(cause),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmModal
      opened
      onClose={onClose}
      onConfirm={() => void confirm()}
      loading={busy}
      color="danger"
      title="Write off expired stock?"
      confirmLabel={`Scrap ${formatCount(units)} ${units === 1 ? "unit" : "units"}`}
      message={
        <Text size="sm" c="var(--mo-color-text-secondary)">
          Expired units can&apos;t be sold (FEFO skips them). Scrapping removes them from stock with the reason{" "}
          <strong>Expired scrap</strong>. The stock ledger keeps the record; this can&apos;t be undone.
        </Text>
      }
    >
      <Stack gap="sm">
        <Paper withBorder radius="md" p="sm" bg="var(--mo-color-surface-muted)">
          <Text size="sm" fw={600}>
            {batch.productTitle}
          </Text>
          <Group gap="xs" justify="space-between" wrap="wrap">
            <Text size="xs" c="var(--mo-color-text-secondary)">
              Batch <span style={{ fontFamily: "var(--mo-font-monospace)" }}>{batch.batchNumber}</span> · expired{" "}
              {formatCalendarDate(batch.expiryDate)}
            </Text>
            <Text size="xs" fw={700} className="mo-tabular-nums">
              {formatCount(units)} units{unitCost !== null ? ` · ${formatMoney(units * unitCost)} at cost` : ""}
            </Text>
          </Group>
        </Paper>
        <TextInput
          label="Note for the ledger"
          placeholder="Optional, e.g. disposed with the supplier's return"
          maxLength={500}
          value={note}
          onChange={(event) => setNote(event.currentTarget.value)}
          disabled={busy}
        />
        {error ? (
          <Text size="sm" c="var(--mo-color-text-danger)" role="alert">
            {error}
          </Text>
        ) : null}
      </Stack>
    </ConfirmModal>
  );
}
