"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  SegmentedControl,
  Select,
  Stack,
  Text,
  TextInput,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconBolt, IconDiscount, IconDotsVertical, IconPencil, IconPlayerPlay, IconPlus, IconSearch, IconTicket, IconBan } from "@tabler/icons-react";
import { ConfirmModal } from "../../../components/admin/ConfirmModal";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { DiscountFormModal, type DiscountPreset } from "../../../components/admin/discounts/DiscountFormModal";
import { FilterBar } from "../../../components/admin/FilterBar";
import { PageHeader } from "../../../components/admin/PageHeader";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCount, formatCountdown, formatDhakaDateTime, formatMoney } from "../../../components/admin/format";
import { useAdminProduct } from "../../../hooks/admin/use-admin-products";
import { useDiscountMutations, useDiscounts } from "../../../hooks/admin/use-discounts";
import { getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_DISCOUNT_STATUSES, type AdminDiscountDTO, type AdminDiscountStatus } from "../../../types/admin";

type KindFilter = "all" | "automatic" | "coupon";

const STATUS_META: Record<AdminDiscountStatus, { label: string; color: string }> = {
  ACTIVE: { label: "Running", color: "success" },
  SCHEDULED: { label: "Scheduled", color: "info" },
  EXPIRED: { label: "Ended", color: "gray" },
  DISABLED: { label: "Deactivated", color: "danger" },
};

function discountValue(discount: AdminDiscountDTO): string {
  const base = discount.type === "PERCENTAGE" ? `${discount.value}% off` : `${formatMoney(discount.value)} off`;
  return discount.maxDiscountAmount !== null ? `${base} (max ${formatMoney(discount.maxDiscountAmount)})` : base;
}

function discountScope(discount: AdminDiscountDTO): string {
  if (discount.scope === "PRODUCT") {
    return discount.product?.title ?? "One product";
  }
  if (discount.scope === "CATEGORY") {
    return discount.category ? `Category: ${discount.category.name}` : "One category";
  }
  return "Whole store";
}

/** Live "ends in …" for running discounts (ticks every 30 s). */
function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = new Date(endsAt).getTime() - now;
  return (
    <Text size="xs" fw={600} c="var(--mo-color-text-brand)" className="mo-tabular-nums">
      {remaining > 0 ? `Ends in ${formatCountdown(remaining)}` : "Ending now"}
    </Text>
  );
}

export default function AdminDiscountsPage() {
  return (
    <RequirePermission permission={PERMISSIONS.DISCOUNTS_MANAGE}>
      <DiscountsView />
    </RequirePermission>
  );
}

function DiscountsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const newParam = searchParams.get("new");
  const presetProductId = searchParams.get("productId");

  const [kind, setKind] = useState<KindFilter>("all");
  const [status, setStatus] = useState<AdminDiscountStatus | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [formOpened, setFormOpened] = useState(() => newParam !== null);
  const [editing, setEditing] = useState<AdminDiscountDTO | null>(null);
  const [newKind, setNewKind] = useState<DiscountPreset["kind"]>(() => (newParam === "automatic" ? "AUTOMATIC" : "COUPON"));
  const [deactivating, setDeactivating] = useState<AdminDiscountDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: presetProduct } = useAdminProduct(newParam !== null ? presetProductId : null);
  const preset = useMemo<DiscountPreset>(
    () => ({
      kind: newKind,
      product: presetProduct
        ? { id: presetProduct.id, title: presetProduct.title, sku: presetProduct.sku, listingStatus: presetProduct.listingStatus }
        : null,
    }),
    [newKind, presetProduct],
  );

  const list = useDiscounts({
    page,
    limit,
    type: kind === "all" ? null : kind,
    status,
    q: debouncedSearch,
  });
  const { deactivateDiscount, updateDiscount } = useDiscountMutations();

  const activeFilters = (search.trim() ? 1 : 0) + (status ? 1 : 0) + (kind !== "all" ? 1 : 0);
  const clearFilters = () => {
    setSearch("");
    setStatus(null);
    setKind("all");
    setPage(1);
  };

  const openCreate = (discountKind: DiscountPreset["kind"]) => {
    setEditing(null);
    setNewKind(discountKind);
    setFormOpened(true);
  };

  const closeForm = () => {
    setFormOpened(false);
    if (newParam !== null) {
      // Drop the one-off `?new=…&productId=…` shortcut so a refresh doesn't reopen the form.
      router.replace(pathname);
    }
  };

  const confirmDeactivate = async () => {
    if (!deactivating) {
      return;
    }
    setBusy(true);
    try {
      await deactivateDiscount(deactivating.id, { mutate: list.mutate, current: list.data });
      notifications.show({ color: "success", title: "Discount deactivated", message: "It no longer applies to new orders." });
      setDeactivating(null);
    } catch (error) {
      notifications.show({ color: "danger", title: "Couldn't deactivate", message: getErrorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const reactivate = async (discount: AdminDiscountDTO) => {
    try {
      const updated = await updateDiscount(discount.id, { isActive: true });
      notifications.show({ color: "success", title: "Discount reactivated", message: `Status: ${STATUS_META[updated.status].label}.` });
    } catch (error) {
      notifications.show({ color: "danger", title: "Couldn't reactivate", message: getErrorMessage(error) });
    }
  };

  const columns: DataTableColumn<AdminDiscountDTO>[] = [
    {
      key: "discount",
      header: "Discount",
      skeletonWidth: "75%",
      cell: (discount) => (
        <Box style={{ minWidth: 0 }}>
          <Group gap={6} wrap="nowrap">
            {discount.kind === "COUPON" ? (
              <Text size="sm" fw={700} ff="var(--mo-font-monospace)">
                {discount.code}
              </Text>
            ) : (
              <Text size="sm" fw={600} lineClamp={1}>
                {discount.name ?? "Automatic discount"}
              </Text>
            )}
            {discount.isFlashSale ? (
              <Badge size="xs" variant="light" color="accentPurple" leftSection={<IconBolt size={10} aria-hidden />}>
                Flash sale
              </Badge>
            ) : null}
          </Group>
          <Text size="xs" c="dimmed" lineClamp={1}>
            {discount.kind === "COUPON" ? (discount.name ?? "Coupon") : "Automatic — no code needed"}
          </Text>
        </Box>
      ),
    },
    {
      key: "value",
      header: "Value",
      width: 170,
      cell: (discount) => (
        <Text size="sm" fw={600} className="mo-tabular-nums">
          {discountValue(discount)}
        </Text>
      ),
    },
    {
      key: "scope",
      header: "Applies to",
      width: 200,
      visibleFrom: "md",
      cell: (discount) => (
        <Box>
          <Text size="sm" lineClamp={1}>
            {discountScope(discount)}
          </Text>
          {discount.minOrderAmount !== null ? (
            <Text size="xs" c="dimmed">
              Min. order {formatMoney(discount.minOrderAmount)}
            </Text>
          ) : null}
        </Box>
      ),
    },
    {
      key: "window",
      header: "Runs",
      width: 220,
      visibleFrom: "lg",
      cell: (discount) => (
        <Box>
          <Text size="xs" style={{ whiteSpace: "nowrap" }}>
            {formatDhakaDateTime(discount.startsAt)}
          </Text>
          <Text size="xs" c="dimmed" style={{ whiteSpace: "nowrap" }}>
            to {formatDhakaDateTime(discount.endsAt)}
          </Text>
        </Box>
      ),
    },
    {
      key: "usage",
      header: "Used",
      align: "right",
      width: 110,
      cell: (discount) => (
        <Box>
          <Text size="sm" className="mo-tabular-nums">
            {formatCount(discount.usageCount)}
            <Text component="span" size="xs" c="dimmed">
              {" "}
              / {discount.usageLimit !== null ? formatCount(discount.usageLimit) : "∞"}
            </Text>
          </Text>
          {discount.perCustomerLimit !== null ? (
            <Text size="xs" c="dimmed">
              {formatCount(discount.perCustomerLimit)} per customer
            </Text>
          ) : null}
        </Box>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      cell: (discount) => (
        <Stack gap={2} align="flex-start">
          <Badge variant="light" color={STATUS_META[discount.status].color} tt="none" fw={600}>
            {STATUS_META[discount.status].label}
          </Badge>
          {discount.status === "ACTIVE" && discount.isFlashSale ? <Countdown endsAt={discount.endsAt} /> : null}
          {discount.status === "SCHEDULED" ? (
            <Text size="xs" c="dimmed">
              Starts {formatDhakaDateTime(discount.startsAt)}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "actions",
      header: <VisuallyHidden>Actions</VisuallyHidden>,
      align: "right",
      width: 60,
      skeletonWidth: 24,
      cell: (discount) => (
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <ActionIcon variant="subtle" color="gray" aria-label={`Actions for ${discount.code ?? discount.name ?? "discount"}`}>
              <IconDotsVertical size={18} aria-hidden />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<IconPencil size={16} aria-hidden />}
              onClick={() => {
                setEditing(discount);
                setFormOpened(true);
              }}
            >
              Edit
            </Menu.Item>
            {discount.isActive ? (
              <Menu.Item color="danger" leftSection={<IconBan size={16} aria-hidden />} onClick={() => setDeactivating(discount)}>
                Deactivate
              </Menu.Item>
            ) : (
              <Menu.Item
                leftSection={<IconPlayerPlay size={16} aria-hidden />}
                disabled={new Date(discount.endsAt).getTime() <= Date.now()}
                onClick={() => void reactivate(discount)}
              >
                Reactivate
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      ),
    },
  ];

  const meta = list.data?.meta;

  return (
    <Stack gap={0}>
      <PageHeader
        title="Discounts"
        description="Coupon codes for checkout and automatic price drops, including flash sales. Times are in Dhaka."
        actions={
          <>
            <Button variant="default" leftSection={<IconBolt size={16} aria-hidden />} onClick={() => openCreate("AUTOMATIC")}>
              New automatic / flash sale
            </Button>
            <Button leftSection={<IconPlus size={16} aria-hidden />} onClick={() => openCreate("COUPON")}>
              New coupon
            </Button>
          </>
        }
      />

      <SegmentedControl
        mb="md"
        value={kind}
        onChange={(value) => {
          setKind(value === "automatic" || value === "coupon" ? value : "all");
          setPage(1);
        }}
        data={[
          { value: "all", label: "All" },
          { value: "coupon", label: "Coupons" },
          { value: "automatic", label: "Automatic" },
        ]}
        aria-label="Discount kind"
        style={{ alignSelf: "flex-start" }}
      />

      <FilterBar activeCount={activeFilters} onReset={clearFilters}>
        <TextInput
          variant="search"
          label="Search"
          placeholder="Name or code"
          leftSection={<IconSearch size={16} aria-hidden />}
          value={search}
          onChange={(event) => {
            setSearch(event.currentTarget.value);
            setPage(1);
          }}
          w={{ base: "100%", sm: 260 }}
        />
        <Select
          label="Status"
          placeholder="Any status"
          clearable
          data={ADMIN_DISCOUNT_STATUSES.map((value) => ({ value, label: STATUS_META[value].label }))}
          value={status}
          onChange={(value) => {
            setStatus(ADMIN_DISCOUNT_STATUSES.find((item) => item === value) ?? null);
            setPage(1);
          }}
          w={{ base: "100%", sm: 180 }}
          radius="xl"
        />
      </FilterBar>

      <DataTable
        label="Discounts"
        columns={columns}
        rows={list.data?.items}
        getRowKey={(discount) => discount.id}
        loading={list.isLoading}
        refreshing={list.isLoading && Boolean(list.data)}
        error={list.error}
        onRetry={() => void list.mutate()}
        permission={PERMISSIONS.DISCOUNTS_MANAGE}
        minWidth={920}
        emptyIcon={kind === "coupon" ? <IconTicket stroke={1.6} /> : <IconDiscount stroke={1.6} />}
        emptyTitle={activeFilters > 0 ? "No discounts match these filters" : "No discounts yet"}
        emptyDescription={activeFilters > 0 ? "Try a different search or clear the filters." : "Create a coupon or an automatic discount to get started."}
        pagination={
          meta
            ? {
                page: meta.page,
                totalPages: meta.totalPages,
                total: meta.total,
                limit: meta.limit,
                onPageChange: setPage,
                onLimitChange: (value) => {
                  setLimit(value);
                  setPage(1);
                },
                itemLabel: "discounts",
              }
            : undefined
        }
      />

      <DiscountFormModal opened={formOpened} onClose={closeForm} discount={editing} preset={preset} />

      <ConfirmModal
        opened={deactivating !== null}
        onClose={() => setDeactivating(null)}
        onConfirm={() => void confirmDeactivate()}
        loading={busy}
        color="danger"
        title="Deactivate this discount?"
        confirmLabel="Deactivate"
        message={`${deactivating?.code ?? deactivating?.name ?? "This discount"} stops applying immediately. Orders that already used it keep their price. You can reactivate it later while its end date is in the future.`}
      />
    </Stack>
  );
}
