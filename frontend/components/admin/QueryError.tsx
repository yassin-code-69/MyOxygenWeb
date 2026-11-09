"use client";

import { Alert, Button, Group, Text } from "@mantine/core";
import { IconAlertCircle, IconRefresh } from "@tabler/icons-react";
import { getErrorMessage, isApiError } from "../../lib/api-client";
import type { Permission } from "../../types/auth";
import { ForbiddenPanel } from "./ForbiddenPanel";

export interface QueryErrorProps {
  error: unknown;
  onRetry?: () => void;
  /** Permission the request needed (shown on a 403). */
  permission?: Permission;
  title?: string;
  compact?: boolean;
}

/** Error state for a failed query: a 403 panel for permission errors, otherwise an alert with retry. */
export function QueryError({ error, onRetry, permission, title = "We couldn't load this data", compact }: QueryErrorProps) {
  if (isApiError(error) && error.status === 403) {
    return <ForbiddenPanel permission={permission} message={error.message} compact={compact} />;
  }
  return (
    <Alert
      color="danger"
      variant="light"
      radius="md"
      icon={<IconAlertCircle size={18} aria-hidden />}
      title={title}
    >
      <Group justify="space-between" align="center" gap="sm" wrap="wrap">
        <Text size="sm">{getErrorMessage(error)}</Text>
        {onRetry ? (
          <Button size="xs" variant="white" color="danger" leftSection={<IconRefresh size={14} aria-hidden />} onClick={onRetry}>
            Try again
          </Button>
        ) : null}
      </Group>
    </Alert>
  );
}
