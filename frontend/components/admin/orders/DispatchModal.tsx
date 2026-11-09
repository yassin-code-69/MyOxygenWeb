"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Button,
  CopyButton,
  Group,
  Modal,
  NumberInput,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  ThemeIcon,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck, IconCircleCheck, IconCopy, IconExternalLink, IconTruckDelivery } from "@tabler/icons-react";
import { useOrderMutations } from "../../../hooks/admin/use-admin-orders";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import type { AdminDispatchPayload, AdminDispatchResult } from "../../../types/admin";
import { formatMoney, humanizeEnum } from "../format";
import { courierName, type OrderRef } from "./order-utils";

export interface DispatchModalProps {
  order: OrderRef | null;
  onClose: () => void;
  onDispatched?: (result: AdminDispatchResult) => void;
}

/** Books a parcel with the configured courier (`POST /admin/orders/:id/dispatch-courier`). */
export function DispatchModal({ order, onClose, onDispatched }: DispatchModalProps) {
  return (
    <Modal
      opened={order !== null}
      onClose={onClose}
      centered
      size="lg"
      closeOnClickOutside={false}
      title={<Text fw={700}>{order ? `Dispatch ${order.orderNumber}` : ""}</Text>}
    >
      {order ? <DispatchForm key={order.id} order={order} onClose={onClose} onDispatched={onDispatched} /> : null}
    </Modal>
  );
}

function describeDispatchError(error: unknown): string {
  if (isApiError(error)) {
    if (error.status === 503) {
      return `The courier isn't configured on the server yet. ${error.message}`;
    }
    if (error.status === 502) {
      return `The courier rejected the booking or couldn't be reached. ${error.message}`;
    }
    if (error.status === 500) {
      return `${error.message} The parcel may have been booked but not saved — check the courier dashboard before retrying.`;
    }
  }
  return getErrorMessage(error);
}

function DispatchForm({ order, onClose, onDispatched }: { order: OrderRef } & Omit<DispatchModalProps, "order">) {
  const { dispatchCourier } = useOrderMutations();
  const [weight, setWeight] = useState<number | string>("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ weightKg?: string; note?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AdminDispatchResult | null>(null);
  const eligible = order.status === "PROCESSING" && !order.trackingId;

  const submit = async () => {
    const nextErrors: typeof errors = {};
    const weightKg = weight === "" ? undefined : Number(weight);
    if (weightKg !== undefined && (!Number.isFinite(weightKg) || weightKg <= 0 || weightKg > 50)) {
      nextErrors.weightKg = "Enter a weight between 0.01 and 50 kg";
    }
    if (note.trim().length > 250) {
      nextErrors.note = "Keep the courier note under 250 characters";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const payload: AdminDispatchPayload = {};
      if (weightKg !== undefined) {
        payload.weightKg = weightKg;
      }
      if (note.trim()) {
        payload.note = note.trim();
      }
      const dispatched = await dispatchCourier(order.id, payload);
      setResult(dispatched);
      notifications.show({
        color: "success",
        title: "Parcel booked",
        message: `${dispatched.order.orderNumber} → ${courierName(dispatched.parcel.provider)} ${dispatched.parcel.trackingId}`,
      });
      onDispatched?.(dispatched);
    } catch (error) {
      if (isApiError(error) && error.code === "VALIDATION_ERROR") {
        setErrors({ weightKg: error.fieldErrors.weightKg?.join(" "), note: error.fieldErrors.note?.join(" ") });
      }
      setFormError(describeDispatchError(error));
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const { parcel } = result;
    return (
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap" align="flex-start">
          <ThemeIcon size={40} radius="xl" color="success" variant="light">
            <IconCircleCheck size={22} aria-hidden />
          </ThemeIcon>
          <div>
            <Text fw={700}>Parcel booked with {courierName(parcel.provider)}</Text>
            <Text size="sm" c="dimmed">
              {result.order.orderNumber} is now {humanizeEnum(result.order.status).toLowerCase()}. The customer gets the tracking
              number.
            </Text>
          </div>
        </Group>
        <Paper withBorder radius="md" p="md">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
            <div>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Tracking number
              </Text>
              <Group gap={4} wrap="nowrap">
                <Text fw={700} ff="var(--mo-font-monospace)">
                  {parcel.trackingId}
                </Text>
                <CopyButton value={parcel.trackingId}>
                  {({ copied, copy }) => (
                    <Tooltip label={copied ? "Copied" : "Copy"}>
                      <ActionIcon variant="subtle" color={copied ? "success" : "gray"} onClick={copy} aria-label="Copy tracking number">
                        {copied ? <IconCheck size={16} aria-hidden /> : <IconCopy size={16} aria-hidden />}
                      </ActionIcon>
                    </Tooltip>
                  )}
                </CopyButton>
              </Group>
            </div>
            <div>
              <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                Courier status
              </Text>
              <Badge variant="light" color="info" mt={4}>
                {humanizeEnum(parcel.normalizedStatus)}
              </Badge>
              {parcel.rawStatus ? (
                <Text size="xs" c="dimmed">
                  {parcel.rawStatus}
                </Text>
              ) : null}
            </div>
            {parcel.consignmentId ? (
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Consignment ID
                </Text>
                <Text ff="var(--mo-font-monospace)">{parcel.consignmentId}</Text>
              </div>
            ) : null}
            {parcel.labelUrl ? (
              <div>
                <Text size="xs" c="dimmed" fw={600} tt="uppercase">
                  Shipping label
                </Text>
                <Anchor href={parcel.labelUrl} target="_blank" rel="noopener noreferrer" size="sm">
                  Open label <IconExternalLink size={12} aria-hidden />
                </Anchor>
              </div>
            ) : null}
          </SimpleGrid>
        </Paper>
        <Group justify="flex-end">
          <Button onClick={onClose}>Done</Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      {!eligible ? (
        <Alert variant="light" color="warning" radius="md" icon={<IconAlertCircle size={18} aria-hidden />}>
          {order.trackingId
            ? `This order already has tracking number ${order.trackingId}.`
            : "Only orders in Processing can be dispatched. Accept the order first."}
        </Alert>
      ) : (
        <Text size="sm">
          Books a parcel with the store&apos;s courier.{" "}
          {order.paymentMethod === "COD" && order.paymentStatus === "UNPAID"
            ? `The courier collects ${formatMoney(order.total)} cash on delivery.`
            : "Nothing is collected on delivery."}{" "}
          The order moves to Shipped and the tracking number is saved automatically.
        </Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
        <NumberInput
          label="Parcel weight (kg)"
          placeholder="Optional"
          min={0}
          max={50}
          decimalScale={2}
          allowNegative={false}
          value={weight}
          onChange={setWeight}
          error={errors.weightKg}
          disabled={!eligible}
        />
      </SimpleGrid>
      <Textarea
        label="Note for the courier"
        placeholder="Optional, e.g. call before delivery"
        autosize
        minRows={2}
        maxRows={4}
        value={note}
        onChange={(event) => setNote(event.currentTarget.value)}
        error={errors.note}
        disabled={!eligible}
      />
      {formError ? (
        <Alert variant="light" color="danger" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} title="Dispatch failed">
          {formError}
        </Alert>
      ) : null}
      <Group justify="flex-end" gap="sm">
        <Button variant="default" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          color="secondaryGreen"
          leftSection={<IconTruckDelivery size={16} aria-hidden />}
          loading={submitting}
          disabled={!eligible}
          onClick={() => void submit()}
        >
          Book parcel
        </Button>
      </Group>
    </Stack>
  );
}
