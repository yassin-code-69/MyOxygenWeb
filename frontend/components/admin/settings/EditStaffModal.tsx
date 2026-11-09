"use client";

import { useState } from "react";
import { Alert, Box, Button, Group, Modal, Select, Stack, Switch, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconLock } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { useStaffMutations } from "../../../hooks/admin/use-staff";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import { formatBangladeshMobile } from "../../../lib/phone";
import { STAFF_ROLES, type StaffRole } from "../../../types/auth";
import type { AdminStaffMember, AdminStaffUpdatePayload } from "../../../types/admin-management";
import { applyApiFieldErrors } from "../form-errors";
import { roleLabel } from "../format";
import { CustomerAvatar } from "../customers/CustomerAvatar";
import { ROLE_DESCRIPTIONS } from "./role-meta";
import { STAFF_CONFLICT_MESSAGES, readStaffConflictReason } from "./staff-errors";

/** A type alias so it satisfies the resolver's `Record<string, unknown>`. */
type EditFormValues = { fullName: string; role: StaffRole; isActive: boolean };

const FIELDS = ["fullName", "role", "isActive"] as const;

/** Mirrors `updateStaffSchema` (backend/src/routes/admin.staff.ts). */
const schema = z.object({
  fullName: z.string().trim().min(2, "Use at least 2 characters").max(255, "Keep the name under 255 characters"),
  role: z.enum(STAFF_ROLES),
  isActive: z.boolean(),
});

const ROLE_OPTIONS = STAFF_ROLES.map((role) => ({ value: role, label: roleLabel(role) }));

export interface EditStaffModalProps {
  member: AdminStaffMember | null;
  /** The signed-in user's id: their own role and active flag are locked. */
  currentUserId: string | null;
  /** Active SUPER_ADMIN accounts right now (the last one can't be demoted or deactivated). */
  activeSuperAdmins: number;
  onClose: () => void;
}

/**
 * Edit a staff account (`PATCH /admin/staff/:id`): name, role, active.
 * Controls the API would refuse are disabled up front with the reason
 * (your own role / account, the last active super admin); a 409 from a
 * race still lands on the right field in plain words.
 */
export function EditStaffModal({ member, currentUserId, activeSuperAdmins, onClose }: EditStaffModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      opened={member !== null}
      onClose={busy ? () => undefined : onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      title={<Text fw={700}>Edit staff member</Text>}
      radius="md"
      centered
    >
      {member ? (
        <EditStaffForm
          key={member.id}
          member={member}
          isSelf={member.id === currentUserId}
          isLastSuperAdmin={member.role === "SUPER_ADMIN" && member.isActive && activeSuperAdmins <= 1}
          onClose={onClose}
          onBusyChange={setBusy}
        />
      ) : null}
    </Modal>
  );
}

function EditStaffForm({
  member,
  isSelf,
  isLastSuperAdmin,
  onClose,
  onBusyChange,
}: {
  member: AdminStaffMember;
  isSelf: boolean;
  isLastSuperAdmin: boolean;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { updateStaff } = useStaffMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<EditFormValues>({
    mode: "controlled",
    initialValues: { fullName: member.fullName, role: member.role, isActive: member.isActive },
    validate: zod4Resolver(schema),
  });

  const roleLocked = isSelf || isLastSuperAdmin;
  const activeLocked = isSelf || isLastSuperAdmin;
  const lockReason = isSelf
    ? "This is your own account: another super admin has to change its role or deactivate it."
    : isLastSuperAdmin
      ? "This is the only active super admin, so it must keep that role and stay active. Promote someone else first."
      : null;

  const submit = form.onSubmit(async (values) => {
    setFormError(null);
    const patch: AdminStaffUpdatePayload = {};
    if (values.fullName.trim() !== member.fullName) {
      patch.fullName = values.fullName.trim();
    }
    if (!roleLocked && values.role !== member.role) {
      patch.role = values.role;
    }
    if (!activeLocked && values.isActive !== member.isActive) {
      patch.isActive = values.isActive;
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setSubmitting(true);
    onBusyChange(true);
    try {
      const updated = await updateStaff(member.id, patch);
      notifications.show({
        color: "success",
        title: "Staff member updated",
        message: `${updated.fullName} · ${roleLabel(updated.role)}${updated.isActive ? "" : " · deactivated"}`,
      });
      onClose();
    } catch (error) {
      const reason = readStaffConflictReason(error);
      if (reason) {
        const conflict = STAFF_CONFLICT_MESSAGES[reason];
        form.setFieldError(conflict.field, conflict.message);
      } else if (!applyApiFieldErrors(form, error, FIELDS)) {
        setFormError(isApiError(error) && error.status === 404 ? "This account no longer exists. Close this and refresh the list." : getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        <Group gap="sm" wrap="nowrap">
          <CustomerAvatar name={member.fullName} seed={member.id} size={44} />
          <Box style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {member.email ?? "No email"}
            </Text>
            <Text size="xs" c="var(--mo-color-text-muted)" className="mo-tabular-nums">
              {formatBangladeshMobile(member.phone)} · email and phone can't be changed here
            </Text>
          </Box>
        </Group>

        {formError ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
            {formError}
          </Alert>
        ) : null}

        <TextInput label="Full name" withAsterisk data-autofocus {...form.getInputProps("fullName")} />

        <Select
          label="Role"
          data={ROLE_OPTIONS}
          allowDeselect={false}
          disabled={roleLocked}
          rightSection={roleLocked ? <IconLock size={14} aria-hidden /> : undefined}
          description={ROLE_DESCRIPTIONS[form.values.role]}
          comboboxProps={{ withinPortal: true }}
          {...form.getInputProps("role")}
        />

        <Switch
          label={form.values.isActive ? "Active — can sign in" : "Inactive — sign-in blocked"}
          description="Deactivating blocks sign-in and ends their access immediately. Their history stays."
          color="secondaryGreen"
          disabled={activeLocked}
          {...form.getInputProps("isActive", { type: "checkbox" })}
        />

        {lockReason ? (
          <Alert color="info" variant="light" radius="md" icon={<IconLock size={18} aria-hidden />}>
            {lockReason}
          </Alert>
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" radius="xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" color="secondaryGreen.8" radius="xl" loading={submitting}>
            Save changes
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
