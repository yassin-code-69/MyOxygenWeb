"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, Stack, Text, Textarea } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle } from "@tabler/icons-react";
import { useOrderActions } from "../../hooks/orders/use-orders";
import { getErrorMessage, isApiError } from "../../lib/api-client";
import { semantic } from "../../tokens";
import type { OrderDetailDTO } from "../../types/order";

const REASON_MAX = 300;

export interface CancelOrderModalProps {
  opened: boolean;
  onClose: () => void;
  order: Pick<OrderDetailDTO, "id" | "orderNumber" | "couponCode">;
  /** Called with the updated order after a successful cancellation. */
  onCancelled?: (order: OrderDetailDTO) => void;
}

/** Confirm dialog for `POST /orders/:id/cancel` (owner, PENDING orders only). */
export function CancelOrderModal({ opened, onClose, order, onCancelled }: CancelOrderModalProps) {
  const { cancelOrder } = useOrderActions();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const close = () => {
    if (submitting) {
      return;
    }
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const updated = await cancelOrder(order, reason);
      notifications.show({
        color: "success",
        title: "Order cancelled",
        message: `Order ${order.orderNumber} has been cancelled.`,
      });
      setReason("");
      onCancelled?.(updated);
      onClose();
    } catch (cancelError) {
      if (isApiError(cancelError) && cancelError.status === 409) {
        setError("This order can no longer be cancelled — it is already being prepared. Refresh to see its latest status.");
      } else {
        setError(getErrorMessage(cancelError, "We couldn't cancel this order. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title={`Cancel order ${order.orderNumber}?`} centered closeButtonProps={{ "aria-label": "Close" }}>
      <Stack gap="md">
        <Text size="sm" c={semantic.textSecondary}>
          We&apos;ll stop this order before it is prepared, and you won&apos;t need to pay for it.
          {order.couponCode ? ` Coupon ${order.couponCode} can be used again.` : ""} This can&apos;t be undone.
        </Text>
        <Textarea
          label="Reason (optional)"
          placeholder="Tell us why you're cancelling"
          value={reason}
          onChange={(event) => setReason(event.currentTarget.value.slice(0, REASON_MAX))}
          maxLength={REASON_MAX}
          autosize
          minRows={2}
          maxRows={5}
          description={`${reason.length}/${REASON_MAX} characters`}
          disabled={submitting}
        />
        {error ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} />} role="alert">
            {error}
          </Alert>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" radius="xl" onClick={close} disabled={submitting}>
            Keep order
          </Button>
          <Button color="danger" radius="xl" onClick={handleConfirm} loading={submitting}>
            Cancel order
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
