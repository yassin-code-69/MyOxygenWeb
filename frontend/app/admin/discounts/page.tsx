"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  UnstyledButton,
  VisuallyHidden,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import {
  IconBan,
  IconBolt,
  IconBuildingStore,
  IconCategory,
  IconDiscount,
  IconDotsVertical,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconReceipt,
  IconSearch,
  IconTicket,
} from "@tabler/icons-react";
import { ConfirmModal } from "../../../components/admin/ConfirmModal";
import { DataTable, type DataTableColumn } from "../../../components/admin/DataTable";
import { DiscountFormModal, type DiscountPreset } from "../../../components/admin/discounts/DiscountFormModal";
import { MeterBar } from "../../../components/admin/MeterBar";
import { RequirePermission } from "../../../components/admin/RequirePermission";
import { formatCount, formatCountdown, formatDhakaDateTime, formatMoney, pluralize } from "../../../components/admin/format";
import { KpiCard, PageHeader, Thumb } from "../../../components/admin/kit";
import { CountTabs, type CountTab } from "../../../components/admin/products/CountTabs";
import { ListCard } from "../../../components/admin/products/ListCard";
import { useAdminProduct, useProductIndex } from "../../../hooks/admin/use-admin-products";
import {
  useDiscount,
  useDiscountKindCounts,
  useDiscountMutations,
  useDiscounts,
  useDiscountStats,
} from "../../../hooks/admin/use-discounts";
import { pickParam, usePaging, useUrlParams } from "../../../hooks/admin/use-ops-url-state";
import { getErrorMessage } from "../../../lib/api-client";
import { PERMISSIONS } from "../../../types/auth";
import { ADMIN_DISCOUNT_STATUSES, type AdminDiscountDTO, type AdminDiscountStatus } from "../../../types/admin";

type KindFilter = "all" | "coupon" | "automatic";

const KIND_FILTERS = ["all", "coupon", "automatic"] as const satisfies readonly KindFilter[];

const STATUS_META: Record<AdminDiscountStatus, { label: string; color: string }> = {
  ACTIVE: { label: "Running", color: "success" },
  SCHEDULED: { label: "Scheduled", color: "info" },
  EXPIRED: { label: "Ended", color: "gray" },
  DISABLED: { label: "Deactivated", color: "danger" },
};

function discountValue(discount: AdminDiscountDTO): string {
  return discount.type === "PERCENTAGE" ? `${discount.value}% off` : `${formatMoney(discount.value)} off`;
}

/** Live "ends in …" for running flash sales (ticks every 30 s). */
function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const remaining = new Date(endsAt).getTime() - now;
  return (
    <Text size="xs" fw={600} c="var(--mo-color-text-brand)" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
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
  const { searchParams, setParams } = useUrlParams();

  // Deep links: ?new=coupon|automatic (&productId=) opens the create form preset,
  // ?discountId= opens the edit form, ?type=coupon|automatic picks the tab.
  const newParam = searchParams.get("new");
  const createKind: DiscountPreset["kind"] | null = newParam === "automatic" ? "AUTOMATIC" : newParam === "coupon" ? "COUPON" : null;
  const presetProductId = createKind ? searchParams.get("productId") : null;
  const editId = searchParams.get("discountId");
  const kind = pickParam(searchParams.get("type"), KIND_FILTERS, "all");

  const [status, setStatus] = useState<AdminDiscountStatus | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch] = useDebouncedValue(search, 300);
  const [deactivating, setDeactivating] = useState<AdminDiscountDTO | null>(null);
  const [busy, setBusy] = useState(false);

  const paging = usePaging(JSON.stringify({ kind, status, q: debouncedSearch }));
  const list = useDiscounts({ page: paging.page, limit: paging.limit, type: kind === "all" ? null : kind, status, q: debouncedSearch });
  const kindCounts = useDiscountKindCounts({ status, q: debouncedSearch });
  const stats = useDiscountStats();
  const { data: productIndex } = useProductIndex();
  const { deactivateDiscount, updateDiscount } = useDiscountMutations();

  const { data: presetProduct, error: presetProductError } = useAdminProduct(presetProductId);
  const preset = useMemo<DiscountPreset>(
    () => ({
      kind: createKind ?? "COUPON",
      product: presetProduct
        ? { id: presetProduct.id, title: presetProduct.title, sku: presetProduct.sku, listingStatus: presetProduct.listingStatus }
        : null,
    }),
    [createKind, presetProduct],
  );

  const listedEdit = editId ? list.data?.items.find((item) => item.id === editId) : undefined;
  const fetchedEdit = useDiscount(editId && !listedEdit ? editId : null);
  const editing = listedEdit ?? fetchedEdit.data ?? null;
  // Wait for a deep-linked product before opening the preset form, so it opens once, filled.
  const presetReady = !presetProductId || presetProduct !== undefined || presetProductError !== undefined;
  const formOpened = editing !== null || (createKind !== null && presetReady);

  const activeFilters = (search.trim() ? 1 : 0) + (status ? 1 : 0);
  const filtered = activeFilters > 0 || kind !== "all";
  const clearFilters = () => {
    setSearch("");
    setStatus(null);
  };

  const openCreate = (discountKind: DiscountPreset["kind"]) =>
    setParams({ new: discountKind === "AUTOMATIC" ? "automatic" : "coupon", discountId: null, productId: null });
  const openEdit = (discount: AdminDiscountDTO) => setParams({ discountId: discount.id, new: null, productId: null });
  // Drop the one-off shortcut params so a refresh doesn't reopen the form.
  const closeForm = () => setParams({ new: null, productId: null, discountId: null });

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

  const counts = kindCounts.data;
  const tabs: CountTab<KindFilter>[] = [
    { value: "all", label: "All", count: counts ? counts.coupon + counts.automatic : null },
    { value: "coupon", label: "Coupons", count: counts?.coupon ?? null },
    { value: "automatic", label: "Automatic & flash sales", count: counts?.automatic ?? null },
  ];

  const scopeCell = (discount: AdminDiscountDTO) => {
    if (discount.scope === "PRODUCT") {
      const entry = discount.productId ? productIndex?.byId.get(discount.productId) : undefined;
      return (
        <Group gap="xs" wrap="nowrap" miw={160}>
          <Thumb src={entry?.image} size={32} />
          <Text size="sm" lineClamp={1}>
            {discount.product?.title ?? "One product"}
          </Text>
        </Group>
      );
    }
    const isCategory = discount.scope === "CATEGORY";
    return (
      <Group gap="xs" wrap="nowrap" miw={160}>
        <ThemeIcon size={32} radius="sm" variant="light" color={isCategory ? "accentPurple" : "secondaryGreen"} aria-hidden>
          {isCategory ? <IconCategory size={16} /> : <IconBuildingStore size={16} />}
        </ThemeIcon>
        <Text size="sm" lineClamp={1}>
          {isCategory ? (discount.category ? `Category: ${discount.category.name}` : "One category") : "Whole store"}
        </Text>
      </Group>
    );
  };

  const columns: DataTableColumn<AdminDiscountDTO>[] = [
    {
      key: "discount",
      header: "Discount",
      width: 260,
      skeletonWidth: "75%",
      cell: (discount) => {
        const coupon = discount.kind === "COUPON";
        return (
          <Group gap="sm" wrap="nowrap" miw={200}>
            <ThemeIcon
              size={36}
              radius="xl"
              variant="light"
              color={coupon ? "primaryPink" : discount.isFlashSale ? "accentPurple" : "secondaryGreen"}
              aria-hidden
            >
              {coupon ? <IconTicket size={18} /> : discount.isFlashSale ? <IconBolt size={18} /> : <IconDiscount size={18} />}
            </ThemeIcon>
            <Box style={{ minWidth: 0 }}>
              <UnstyledButton onClick={() => openEdit(discount)} aria-label={`Edit ${discount.code ?? discount.name ?? "discount"}`}>
                {coupon ? (
                  <Text size="sm" fw={700} ff="var(--mo-font-monospace)" c="var(--mo-color-text)">
                    {discount.code}
                  </Text>
                ) : (
                  <Text size="sm" fw={600} lineClamp={1} c="var(--mo-color-text)">
                    {discount.name ?? "Automatic discount"}
                  </Text>
                )}
              </UnstyledButton>
              <Text size="xs" c="var(--mo-color-text-muted)" lineClamp={1}>
                {coupon ? (discount.name ?? "Coupon code") : discount.isFlashSale ? "Flash sale · no code needed" : "Automatic · no code needed"}
              </Text>
            </Box>
          </Group>
        );
      },
    },
    {
      key: "value",
      header: "Value",
      width: 150,
      cell: (discount) => (
        <Stack gap={2} align="flex-start">
          <Badge variant="light" radius="xl" tt="none" fw={700} color="primaryPink" className="mo-tabular-nums">
            {discountValue(discount)}
          </Badge>
          {discount.maxDiscountAmount !== null ? (
            <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
              Max {formatMoney(discount.maxDiscountAmount)}
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "scope",
      header: "Applies to",
      width: 230,
      cell: (discount) => (
        <Box>
          {scopeCell(discount)}
          {discount.minOrderAmount !== null ? (
            <Text size="xs" c="var(--mo-color-text-muted)" mt={2}>
              Min. order {formatMoney(discount.minOrderAmount)}
            </Text>
          ) : null}
        </Box>
      ),
    },
    {
      key: "window",
      header: "Runs (Dhaka)",
      width: 200,
      cell: (discount) => (
        <Box>
          <Text size="xs" c="var(--mo-color-text)" style={{ whiteSpace: "nowrap" }}>
            {formatDhakaDateTime(discount.startsAt)}
          </Text>
          <Text size="xs" c="var(--mo-color-text-muted)" style={{ whiteSpace: "nowrap" }}>
            to {formatDhakaDateTime(discount.endsAt)}
          </Text>
        </Box>
      ),
    },
    {
      key: "usage",
      header: "Used",
      align: "right",
      width: 120,
      cell: (discount) => (
        <Stack gap={4} align="stretch" miw={90}>
          <Text size="sm" ta="right" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
            <strong>{formatCount(discount.usageCount)}</strong>
            <Text component="span" size="xs" c="var(--mo-color-text-muted)">
              {" "}
              / {discount.usageLimit !== null ? formatCount(discount.usageLimit) : "∞"}
            </Text>
          </Text>
          {discount.usageLimit !== null ? (
            <MeterBar ratio={discount.usageLimit > 0 ? discount.usageCount / discount.usageLimit : 0} color="primaryPink" height={4} />
          ) : null}
          {discount.perCustomerLimit !== null ? (
            <Text size="xs" c="var(--mo-color-text-muted)" ta="right" style={{ whiteSpace: "nowrap" }}>
              {formatCount(discount.perCustomerLimit)} per customer
            </Text>
          ) : null}
        </Stack>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 140,
      cell: (discount) => (
        <Stack gap={2} align="flex-start">
          <Badge variant="light" radius="xl" color={STATUS_META[discount.status].color} tt="none" fw={600}>
            {STATUS_META[discount.status].label}
          </Badge>
          {discount.status === "ACTIVE" && discount.isFlashSale ? <Countdown endsAt={discount.endsAt} /> : null}
          {discount.status === "SCHEDULED" ? (
            <Text size="xs" c="var(--mo-color-text-muted)">
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
      width: 110,
      skeletonWidth: 70,
      cell: (discount) => (
        <Group gap={6} justify="flex-end" wrap="nowrap">
          <Button size="compact-sm" radius="xl" variant="light" color="info" onClick={() => openEdit(discount)} aria-label={`Edit ${discount.code ?? discount.name ?? "discount"}`}>
            Edit
          </Button>
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" radius="xl" aria-label={`Actions for ${discount.code ?? discount.name ?? "discount"}`}>
                <IconDotsVertical size={18} aria-hidden />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item leftSection={<IconPencil size={16} aria-hidden />} onClick={() => openEdit(discount)}>
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
        </Group>
      ),
    },
  ];

  const meta = list.data?.meta;
  const statsData = stats.data;
  const statsLoading = stats.isLoading && !statsData;

  return (
    <Stack gap="lg">
      <PageHeader
        mb={0}
        icon={<IconDiscount size={20} />}
        title="Coupons & Offers"
        subtitle="Coupon codes for checkout and automatic price drops, including flash sales with a storefront countdown. Times are in Dhaka."
        actions={
          <>
            <Button variant="default" radius="xl" leftSection={<IconBolt size={16} aria-hidden />} onClick={() => openCreate("AUTOMATIC")}>
              New automatic / flash sale
            </Button>
            <Button radius="xl" color="secondaryGreen.8" leftSection={<IconPlus size={16} aria-hidden />} onClick={() => openCreate("COUPON")}>
              New coupon
            </Button>
          </>
        }
      />

      {stats.error && !statsData ? null : (
        <SimpleGrid cols={{ base: 1, xs: 2, lg: 4 }} spacing="md">
          <KpiCard
            tone="rose"
            icon={<IconTicket size={24} stroke={1.8} />}
            label="Active coupons"
            value={statsData ? formatCount(statsData.activeCoupons) : undefined}
            hint="Usable at checkout right now"
            loading={statsLoading}
          />
          <KpiCard
            tone="lavender"
            icon={<IconBolt size={24} stroke={1.8} />}
            label="Running flash sales"
            value={statsData ? formatCount(statsData.runningFlashSales) : undefined}
            hint="With a storefront countdown"
            loading={statsLoading}
          />
          <KpiCard
            tone="mint"
            icon={<IconDiscount size={24} stroke={1.8} />}
            label="Automatic price drops"
            value={statsData ? formatCount(statsData.runningAutomatic) : undefined}
            hint={statsData ? `Running now · ${formatCount(statsData.scheduled)} scheduled` : undefined}
            loading={statsLoading}
          />
          <KpiCard
            tone="sky"
            icon={<IconReceipt size={24} stroke={1.8} />}
            label="Total redemptions"
            value={statsData ? formatCount(statsData.totalRedemptions) : undefined}
            hint="Coupon uses, all time"
            loading={statsLoading}
          />
        </SimpleGrid>
      )}

      {editId && !listedEdit && fetchedEdit.error ? (
        <Alert color="danger" variant="light" radius="md" withCloseButton onClose={() => setParams({ discountId: null })} title="Couldn't open that discount">
          {getErrorMessage(fetchedEdit.error)}
        </Alert>
      ) : null}

      <ListCard
        title="Discounts"
        icon={<IconTicket size={18} color="var(--mo-color-secondary-8)" aria-hidden />}
        subtitle={meta ? pluralize(meta.total, filtered ? "matching discount" : "discount") : "Loading discounts…"}
        tabs={<CountTabs label="Discount kind" value={kind} onChange={(next) => setParams({ type: next === "all" ? null : next })} tabs={tabs} />}
        filters={
          <>
            <TextInput
              aria-label="Search discounts"
              placeholder="Name or code"
              leftSection={<IconSearch size={16} aria-hidden />}
              radius="xl"
              value={search}
              onChange={(event) => setSearch(event.currentTarget.value)}
              w={{ base: "100%", sm: 260 }}
            />
            <Select
              aria-label="Status"
              placeholder="Any status"
              clearable
              data={ADMIN_DISCOUNT_STATUSES.map((value) => ({ value, label: STATUS_META[value].label }))}
              value={status}
              onChange={(value) => setStatus(ADMIN_DISCOUNT_STATUSES.find((item) => item === value) ?? null)}
              w={{ base: "100%", xs: 180 }}
              radius="xl"
            />
          </>
        }
        activeFilterCount={activeFilters}
        onResetFilters={clearFilters}
      >
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
          minWidth={1160}
          emptyIcon={kind === "coupon" ? <IconTicket stroke={1.6} /> : <IconDiscount stroke={1.6} />}
          emptyTitle={filtered ? "No discounts match these filters" : "No discounts yet"}
          emptyDescription={filtered ? "Try a different search, another tab or clear the filters." : "Create a coupon or an automatic discount to get started."}
          emptyAction={
            activeFilters > 0 ? (
              <Button variant="light" radius="xl" onClick={clearFilters}>
                Clear filters
              </Button>
            ) : (
              <Button radius="xl" color="secondaryGreen.8" leftSection={<IconPlus size={16} aria-hidden />} onClick={() => openCreate(kind === "automatic" ? "AUTOMATIC" : "COUPON")}>
                {kind === "automatic" ? "New automatic discount" : "New coupon"}
              </Button>
            )
          }
          pagination={
            meta
              ? {
                  page: meta.page,
                  totalPages: meta.totalPages,
                  total: meta.total,
                  limit: meta.limit,
                  onPageChange: paging.setPage,
                  onLimitChange: paging.setLimit,
                  itemLabel: "discounts",
                }
              : undefined
          }
        />
      </ListCard>

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
