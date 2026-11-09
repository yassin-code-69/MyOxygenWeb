import { Badge, Tooltip, type MantineSize } from "@mantine/core";
import { IconCircleCheck, IconEyeOff, IconHourglass } from "@tabler/icons-react";
import type { ReactNode } from "react";
import type { AdminListingStatus } from "../../types/admin";

const CONFIG: Record<AdminListingStatus, { label: string; color: string; icon: ReactNode; help: string }> = {
  ACTIVE: {
    label: "Live",
    color: "success",
    icon: <IconCircleCheck size={12} aria-hidden />,
    help: "Visible and purchasable on the storefront.",
  },
  AWAITING_STOCK: {
    label: "Awaiting stock",
    color: "warning",
    icon: <IconHourglass size={12} aria-hidden />,
    help: "Hidden automatically because it has no sellable stock. It goes live by itself when the next batch is imported.",
  },
  INACTIVE: {
    label: "Inactive",
    color: "gray",
    icon: <IconEyeOff size={12} aria-hidden />,
    help: "Hidden by an admin. It stays hidden until someone reactivates it, even when stock arrives.",
  },
};

export const LISTING_STATUS_HELP: Record<AdminListingStatus, string> = {
  ACTIVE: CONFIG.ACTIVE.help,
  AWAITING_STOCK: CONFIG.AWAITING_STOCK.help,
  INACTIVE: CONFIG.INACTIVE.help,
};

/** Storefront listing status of a product, with an explanatory tooltip. */
export function ListingStatusBadge({ status, size = "sm" }: { status: AdminListingStatus; size?: MantineSize }) {
  const config = CONFIG[status];
  return (
    <Tooltip label={config.help} multiline w={260}>
      <Badge variant="light" color={config.color} size={size} leftSection={config.icon} tt="none" fw={600}>
        {config.label}
      </Badge>
    </Tooltip>
  );
}
