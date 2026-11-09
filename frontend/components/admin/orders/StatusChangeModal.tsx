"use client";

import { useState } from "react";
import { Alert, Button, Checkbox, Group, Modal, SimpleGrid, Stack, Switch, Text, TextInput, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconAlertTriangle, IconInfoCircle } from "@tabler/icons-react";
import type { KeyedMutator } from "swr";
import { StatusBadge } from "../../StatusBadge";
import { useOrderMutations, type AdminOrdersPage } from "../../../hooks/admin/use-admin-orders";
import { useAdminRevalidate } from "../../../hooks/admin/swr";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import type { OrderStatus } from "../../../types/order";
import type { AdminCourierCancellation, AdminOrderDetailDTO, AdminOrderStatusPayload } from "../../../types/admin";
import { humanizeEnum } from "../format";
import { courierName, readCourierCancellation, TRANSITION_LABELS, type OrderRef } from "./order-utils";

export interface StatusChangeRequest {
  order: OrderRef;
  target: OrderStatus;
}

export interface StatusChangeModalProps {
  request: StatusChangeRequest | null;
  onClose: () => void;
  onChanged?: (detail: AdminOrderDetailDTO) => void;
  /** The list on screen (optimistic row update). */
  list?: { mutate: KeyedMutator<AdminOrdersPage>; current: AdminOrdersPage | undefined };
}

/** Confirms an order status change (`PATCH /admin/orders/:id/status`) with the consequences spelled out. */
export function StatusChangeModal({ request, onClose, onChanged, list }: StatusChangeModalProps) {
  return (
    <Modal
      opened={request !== null}
      onClose={onClose}
      centered
      size="lg"
      title={<Text fw={700}>{request ? `${TRANSITION_LABELS[request.target]} · ${request.order.orderNumber}` : ""}</Text>}
    >
      {request ? (
        <StatusChangeForm key={`${request.order.id}-${request.target}`} request={request} onClose={onClose} onChanged={onChanged} list={list} />
      ) : null}
    </Modal>
  );
}

function Consequences({ order, target }: StatusChangeRequest) {
  switch (target) {
    case "PROCESSING":
      return <Text size="sm">The customer is told their order is being prepared. Next step: dispatch it to the courier.</Text>;
    case "SHIPPED":
      return (
        <Text size="sm">
          Use this when the parcel left with a courier outside the automatic Steadfast booking. To book Steadfast, use
          <strong> Dispatch to courier</strong> instead.
        </Text>
      );
    case "DELIVERED":
      return (
        <Text size="sm">
          The order is complete.{" "}
          {order.paymentMethod === "COD" && order.paymentStatus === "UNPAID" ? "Its cash-on-delivery payment will be marked as paid." : ""}
        </Text>
      );
    case "CANCELLED":
      return (
        <Stack gap={6}>
          <Text size="sm">
            Reserved stock goes back to the batches it came from (recorded in the stock ledger as a return), any coupon use is
            released, and the customer is notified. This can&apos;t be undone.
          </Text>
          {order.status === "SHIPPED" && order.trackingId ? (
            <Text size="sm">
              We&apos;ll first ask {courierName(order.courierProvider)} to cancel parcel <strong>{order.trackingId}</strong>.
            </Text>
          ) : null}
        </Stack>
      );
    case "REFUNDED":
      return (
        <Text size="sm">
          The payment status becomes Refunded. This only records the refund — return the money to the customer separately.
        </Text>
      );
    default:
      return null;
  }
}

function StatusChangeForm({ request, onClose, onChanged, list }: Omit<StatusChangeModalProps, "request"> & { request: StatusChangeRequest }) {
  const { order, target } = request;
  const { changeStatus } = useOrderMutations();
  const revalidate = useAdminRevalidate();
  const [note, setNote] = useState("");
  const [manualShipment, setManualShipment] = useState(false);
  const [courierProvider, setCourierProvider] = useState("");
  const [trackingId, setTrackingId] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ courierProvider?: string; trackingId?: string; note?: string }>({});
  const [conflict, setConflict] = useState<AdminCourierCancellation | null>(null);
  const [courierConfirmed, setCourierConfirmed] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const destructive = target === "CANCELLED" || target === "REFUNDED";

  const validate = (): boolean => {
    const errors: typeof fieldErrors = {};
    if (note.trim().length > 500) {
      errors.note = "Keep the note under 500 characters";
    }
    if (manualShipment) {
      const provider = courierProvider.trim();
      const tracking = trackingId.trim();
      if (provider.length < 2 || provider.length > 64) {
        errors.courierProvider = "Enter the courier name (2–64 characters)";
      }
      if (tracking.length < 1 || tracking.length > 128) {
        errors.trackingId = "Enter the tracking number (up to 128 characters)";
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const submit = async () => {
    if (!validate()) {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    const payload: AdminOrderStatusPayload = { status: target };
    if (note.trim()) {
      payload.note = note.trim();
    }
    if (target === "SHIPPED" && manualShipment) {
      payload.courierProvider = courierProvider.trim();
      payload.trackingId = trackingId.trim();
    }
    if (conflict && courierConfirmed) {
      payload.courierCancellationConfirmed = true;
    }
    try {
      const detail = await changeStatus(order.id, payload, list);
      notifications.show({
        color: "success",
        title: `Order ${detail.orderNumber}`,
        message: `Status is now ${humanizeEnum(detail.status)}.`,
      });
      onChanged?.(detail);
      onClose();
    } catch (error) {
      const courierConflict = readCourierCancellation(error);
      if (courierConflict) {
        setConflict(courierConflict);
      } else if (isApiError(error) && error.code === "INVALID_STATUS_TRANSITION") {
        setFormError(`${error.message} The order changed in the meantime — the list has been refreshed.`);
        void revalidate("/admin/orders", "/orders/");
      } else if (isApiError(error) && error.code === "VALIDATION_ERROR") {
        const errors = error.fieldErrors;
        setFieldErrors({
          note: errors.note?.join(" "),
          courierProvider: errors.courierProvider?.join(" "),
          trackingId: errors.trackingId?.join(" "),
        });
        setFormError(error.message);
      } else {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack gap="md">
      <Group gap="xs">
        <StatusBadge status={order.status} />
        <Text size="sm" c="dimmed" aria-hidden>
          →
        </Text>
        <StatusBadge status={target} />
      </Group>

      <Alert
        variant="light"
        radius="md"
        color={destructive ? "danger" : "info"}
        icon={destructive ? <IconAlertTriangle size={18} aria-hidden /> : <IconInfoCircle size={18} aria-hidden />}
      >
        <Consequences order={order} target={target} />
      </Alert>

      {target === "SHIPPED" ? (
        <Stack gap="sm">
          <Switch
            label="Add tracking from another courier"
            checked={manualShipment}
            onChange={(event) => setManualShipment(event.currentTarget.checked)}
          />
          {manualShipment ? (
            <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
              <TextInput
                label="Courier"
                withAsterisk
                placeholder="e.g. Pathao, RedX"
                value={courierProvider}
                onChange={(event) => setCourierProvider(event.currentTarget.value)}
                error={fieldErrors.courierProvider}
              />
              <TextInput
                label="Tracking number"
                withAsterisk
                value={trackingId}
                onChange={(event) => setTrackingId(event.currentTarget.value)}
                error={fieldErrors.trackingId}
              />
            </SimpleGrid>
          ) : null}
        </Stack>
      ) : null}

      <Textarea
        label="Note (shown in the order timeline, visible to the customer)"
        placeholder="Optional"
        autosize
        minRows={2}
        maxRows={4}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        error={fieldErrors.note}
      />

      {conflict ? (
        <Alert variant="light" color="warning" radius="md" icon={<IconAlertTriangle size={18} aria-hidden />} title="The courier didn't confirm the cancellation">
          <Stack gap="xs">
            <Text size="sm">{conflict.message}</Text>
            <Checkbox
              label={`I have cancelled parcel ${conflict.trackingId} with ${courierName(conflict.provider)} myself`}
              checked={courierConfirmed}
              onChange={(event) => setCourierConfirmed(event.currentTarget.checked)}
            />
          </Stack>
        </Alert>
      ) : null}

      {formError ? (
        <Alert variant="light" color="danger" radius="md" icon={<IconAlertCircle size={18} aria-hidden />}>
          {formError}
        </Alert>
      ) : null}

      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose} disabled={submitting}>
          Keep as {humanizeEnum(order.status).toLowerCase()}
        </Button>
        <Button
          color={destructive ? "danger" : "primaryPink"}
          loading={submitting}
          disabled={conflict !== null && !courierConfirmed}
          onClick={() => void submit()}
        >
          {conflict ? "Cancel order anyway" : TRANSITION_LABELS[target]}
        </Button>
      </Group>
    </Stack>
  );
}
