import { Text, Timeline } from "@mantine/core";
import { getStatusConfig } from "../../StatusBadge";
import type { AdminOrderStatusHistoryEntry } from "../../../types/admin";
import { formatDhakaDateTime, humanizeEnum, roleLabel } from "../format";

/** Order status history, oldest first, with who changed it and the note. */
export function OrderTimeline({ history }: { history: AdminOrderStatusHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No status changes recorded yet.
      </Text>
    );
  }
  const entries = [...history].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <Timeline active={entries.length - 1} bulletSize={14} lineWidth={2} color="primaryPink">
      {entries.map((entry) => {
        const config = getStatusConfig(entry.toStatus);
        return (
          <Timeline.Item
            key={entry.id}
            color={config.color}
            title={
              <Text size="sm" fw={600}>
                {entry.fromStatus ? `${humanizeEnum(entry.fromStatus)} → ${config.label}` : config.label}
              </Text>
            }
          >
            <Text size="xs" c="dimmed">
              {formatDhakaDateTime(entry.createdAt)}
              {entry.changedBy ? ` · ${entry.changedBy.fullName} (${roleLabel(entry.changedBy.role)})` : ""}
            </Text>
            {entry.note ? (
              <Text size="sm" mt={4} c="var(--mo-color-text-secondary)">
                {entry.note}
              </Text>
            ) : null}
          </Timeline.Item>
        );
      })}
    </Timeline>
  );
}
