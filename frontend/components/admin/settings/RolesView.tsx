"use client";

import { useMemo } from "react";
import { Badge, Box, Button, Grid, Group, Stack, Text } from "@mantine/core";
import { IconEdit, IconShieldCheck, IconShieldLock, IconUserOff, IconUserPlus, IconUsers } from "@tabler/icons-react";
import { useRoles, useStaff } from "../../../hooks/admin/use-staff";
import { useAuthStore } from "../../../lib/auth-store";
import { formatBangladeshMobile } from "../../../lib/phone";
import { PERMISSIONS } from "../../../types/auth";
import type { AdminStaffMember } from "../../../types/admin-management";
import { DataTable, type DataTableColumn } from "../DataTable";
import { QueryError } from "../QueryError";
import { formatCount, formatDhakaDate, roleLabel } from "../format";
import { KpiCard, PageHeader, SectionCard } from "../kit";
import { ActiveBadge } from "../customers/ActiveBadge";
import { CustomerAvatar } from "../customers/CustomerAvatar";
import { MANAGEMENT_GRID_BREAKPOINTS } from "../customers/CustomerKpis";
import { useUrlParams } from "../payments/url-state";
import { AddStaffModal } from "./AddStaffModal";
import { EditStaffModal } from "./EditStaffModal";
import { RoleMatrix } from "./RoleMatrix";
import { ROLE_COLORS, STAFF_ROLE_ORDER } from "./role-meta";

/**
 * `/admin/settings/roles` (STAFF_MANAGE): staff accounts and the role ×
 * permission matrix. URL state: `?new=1` (Add staff), `?staffId=` (edit).
 */
export function RolesView() {
  const { searchParams, setParams } = useUrlParams();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const staff = useStaff();
  const roles = useRoles();

  const adding = searchParams.get("new") === "1";
  const editId = searchParams.get("staffId");

  const rows = useMemo(() => {
    if (!staff.data) {
      return undefined;
    }
    return [...staff.data].sort(
      (a, b) =>
        Number(b.isActive) - Number(a.isActive) ||
        STAFF_ROLE_ORDER.indexOf(a.role) - STAFF_ROLE_ORDER.indexOf(b.role) ||
        a.fullName.localeCompare(b.fullName),
    );
  }, [staff.data]);

  const totals = staff.data
    ? {
        total: staff.data.length,
        active: staff.data.filter((member) => member.isActive).length,
        superAdmins: staff.data.filter((member) => member.isActive && member.role === "SUPER_ADMIN").length,
        inactive: staff.data.filter((member) => !member.isActive).length,
      }
    : null;
  const editing = editId ? (staff.data?.find((member) => member.id === editId) ?? null) : null;
  const loading = staff.isLoading && !staff.data;

  const columns: DataTableColumn<AdminStaffMember>[] = [
    {
      key: "name",
      header: "Name",
      skeletonWidth: "80%",
      cell: (member) => (
        <Group gap="sm" wrap="nowrap" miw={200}>
          <CustomerAvatar name={member.fullName} seed={member.id} />
          <Box style={{ minWidth: 0 }}>
            <Group gap={6} wrap="nowrap">
              <Text size="sm" fw={600} truncate>
                {member.fullName}
              </Text>
              {member.id === currentUserId ? (
                <Badge size="xs" radius="xl" variant="light" color="gray" tt="none" style={{ flexShrink: 0 }}>
                  You
                </Badge>
              ) : null}
            </Group>
            <Text size="xs" c="var(--mo-color-text-muted)">
              Added {formatDhakaDate(member.createdAt)}
            </Text>
          </Box>
        </Group>
      ),
    },
    {
      key: "email",
      header: "Email",
      skeletonWidth: "75%",
      cell: (member) => (
        <Text size="sm" c={member.email ? "var(--mo-color-text-secondary)" : "var(--mo-color-text-subtle)"} truncate maw={260}>
          {member.email ?? "No email"}
        </Text>
      ),
    },
    {
      key: "phone",
      header: "Phone",
      width: 140,
      skeletonWidth: 96,
      cell: (member) => (
        <Text size="sm" className="mo-tabular-nums" style={{ whiteSpace: "nowrap" }}>
          {formatBangladeshMobile(member.phone)}
        </Text>
      ),
    },
    {
      key: "role",
      header: "Role",
      width: 180,
      skeletonWidth: 110,
      cell: (member) => (
        <Badge color={ROLE_COLORS[member.role]} variant="light" radius="xl" tt="none" fw={600} leftSection={<IconShieldCheck size={12} aria-hidden />} style={{ maxWidth: "none" }}>
          {roleLabel(member.role)}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      width: 120,
      skeletonWidth: 64,
      cell: (member) => <ActiveBadge active={member.isActive} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: 100,
      skeletonWidth: 56,
      cell: (member) => (
        <Button
          size="compact-sm"
          variant="subtle"
          color="gray"
          radius="xl"
          leftSection={<IconEdit size={14} aria-hidden />}
          onClick={() => setParams({ staffId: member.id, new: null })}
          aria-label={`Edit ${member.fullName}`}
        >
          Edit
        </Button>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader
        icon={<IconShieldLock size={20} />}
        title="Admin Roles"
        subtitle="Who can sign in to the back-office, and what each role is allowed to do."
        mb={0}
        actions={
          <Button color="secondaryGreen.8" radius="xl" leftSection={<IconUserPlus size={18} aria-hidden />} onClick={() => setParams({ new: 1, staffId: null })}>
            Add staff
          </Button>
        }
      />

      <Grid type="container" breakpoints={MANAGEMENT_GRID_BREAKPOINTS} gap="md">
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="sky" icon={<IconUsers size={24} stroke={1.8} />} label="Staff Accounts" value={totals ? formatCount(totals.total) : undefined} hint="Everyone with back-office access" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="mint" icon={<IconShieldCheck size={24} stroke={1.8} />} label="Active" value={totals ? formatCount(totals.active) : undefined} hint="Can sign in today" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="rose" icon={<IconShieldLock size={24} stroke={1.8} />} label="Super Admins" value={totals ? formatCount(totals.superAdmins) : undefined} hint="Full access, incl. staff and profit" loading={loading} />
        </Grid.Col>
        <Grid.Col span={{ base: 12, xs: 6, lg: 3 }}>
          <KpiCard tone="peach" icon={<IconUserOff size={24} stroke={1.8} />} label="Deactivated" value={totals ? formatCount(totals.inactive) : undefined} hint="Sign-in blocked" loading={loading} />
        </Grid.Col>
      </Grid>

      <Box>
        <Text component="h2" m={0} mb="sm" fw={600} fz="md" ff="var(--mo-font-heading)" c="var(--mo-color-text)">
          Staff members
        </Text>
        <DataTable
          label="Staff members"
          columns={columns}
          rows={rows}
          getRowKey={(member) => member.id}
          loading={staff.isLoading}
          refreshing={staff.isValidating}
          error={staff.error}
          onRetry={() => void staff.mutate()}
          permission={PERMISSIONS.STAFF_MANAGE}
          skeletonRows={5}
          minWidth={880}
          emptyIcon={<IconUsers stroke={1.6} />}
          emptyTitle="No staff accounts yet"
          emptyDescription="Add the people who help run the store."
          getRowStyle={(member) => (member.isActive ? undefined : { background: "var(--mo-color-surface-muted)" })}
        />
      </Box>

      <SectionCard title="What each role can do" subtitle="Ticks come straight from the server's permission rules." fullHeight={false}>
        {roles.error && !roles.data ? (
          <QueryError error={roles.error} onRetry={() => void roles.mutate()} permission={PERMISSIONS.STAFF_MANAGE} compact />
        ) : (
          <RoleMatrix roles={roles.data} loading={roles.isLoading} />
        )}
      </SectionCard>

      <AddStaffModal opened={adding} onClose={() => setParams({ new: null })} />
      <EditStaffModal
        member={editing}
        currentUserId={currentUserId}
        activeSuperAdmins={totals?.superAdmins ?? 0}
        onClose={() => setParams({ staffId: null })}
      />
    </Stack>
  );
}
