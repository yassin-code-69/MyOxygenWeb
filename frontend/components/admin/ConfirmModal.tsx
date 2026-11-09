"use client";

import type { ReactNode } from "react";
import { Button, Group, Modal, Stack, Text, type MantineColor } from "@mantine/core";

export interface ConfirmModalProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  /** Main explanation. */
  message: ReactNode;
  /** Extra content (inputs, warnings) below the message. */
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for destructive actions. */
  color?: MantineColor;
  loading?: boolean;
  confirmDisabled?: boolean;
}

/** Confirmation dialog for consequential actions. Cannot be dismissed while the action runs. */
export function ConfirmModal({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  color = "primaryPink",
  loading = false,
  confirmDisabled = false,
}: ConfirmModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={loading ? () => undefined : onClose}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      withCloseButton={!loading}
      title={<Text fw={700}>{title}</Text>}
      centered
    >
      <Stack gap="md">
        {typeof message === "string" ? (
          <Text size="sm" c="var(--mo-color-text-secondary)">
            {message}
          </Text>
        ) : (
          message
        )}
        {children}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button color={color} onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
