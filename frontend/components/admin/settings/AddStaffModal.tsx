"use client";

import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  CopyButton,
  Group,
  Modal,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCheck, IconCopy, IconWand } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { useStaffMutations } from "../../../hooks/admin/use-staff";
import { getErrorMessage } from "../../../lib/api-client";
import { BANGLADESH_MOBILE_PATTERN, compactPhone, normalizeBangladeshMobile } from "../../../lib/phone";
import { STAFF_ROLES, type StaffRole } from "../../../types/auth";
import { applyApiFieldErrors } from "../form-errors";
import { roleLabel } from "../format";
import { MAX_PASSWORD_BYTES, MIN_STAFF_PASSWORD, PasswordStrength, generatePassword, passwordBytes } from "./PasswordStrength";
import { ROLE_DESCRIPTIONS } from "./role-meta";

/** A type alias so it satisfies the resolver's `Record<string, unknown>`. */
type StaffFormValues = {
  fullName: string;
  email: string;
  phone: string;
  role: StaffRole | null;
  password: string;
};

const FIELDS = ["fullName", "email", "phone", "role", "password"] as const;

/** Mirrors `createStaffSchema` (backend/src/routes/admin.staff.ts). */
const schema = z.object({
  fullName: z.string().trim().min(2, "Use at least 2 characters").max(255, "Keep the name under 255 characters"),
  email: z.string().trim().min(1, "Enter an email address").max(255).email("Enter a valid email address"),
  phone: z
    .string()
    .trim()
    .min(1, "Enter a mobile number")
    .refine((value) => BANGLADESH_MOBILE_PATTERN.test(compactPhone(value)), "Enter a Bangladeshi mobile number, e.g. 01712-345678"),
  role: z.enum(STAFF_ROLES, { error: "Choose a role" }).nullable().refine((value) => value !== null, "Choose a role"),
  password: z
    .string()
    .min(MIN_STAFF_PASSWORD, `Use at least ${MIN_STAFF_PASSWORD} characters`)
    .refine((value) => passwordBytes(value) <= MAX_PASSWORD_BYTES, `Keep it under ${MAX_PASSWORD_BYTES} bytes`),
});

const ROLE_OPTIONS = STAFF_ROLES.map((role) => ({ value: role, label: roleLabel(role) }));

function roleDescription(value: string): string {
  const role = STAFF_ROLES.find((item) => item === value);
  return role ? ROLE_DESCRIPTIONS[role] : "";
}

export interface AddStaffModalProps {
  opened: boolean;
  onClose: () => void;
}

/** Create a staff account (`POST /admin/staff`). Duplicate email / phone (409) and 422s land on their fields. */
export function AddStaffModal({ opened, onClose }: AddStaffModalProps) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      opened={opened}
      onClose={busy ? () => undefined : onClose}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      withCloseButton={!busy}
      title={<Text fw={700}>Add staff member</Text>}
      size="lg"
      radius="md"
      centered
    >
      {opened ? <AddStaffForm onClose={onClose} onBusyChange={setBusy} /> : null}
    </Modal>
  );
}

function AddStaffForm({ onClose, onBusyChange }: { onClose: () => void; onBusyChange: (busy: boolean) => void }) {
  const { createStaff } = useStaffMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<StaffFormValues>({
    mode: "controlled",
    initialValues: { fullName: "", email: "", phone: "", role: null, password: "" },
    validate: zod4Resolver(schema),
  });

  const submit = form.onSubmit(async (values) => {
    if (!values.role) {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    onBusyChange(true);
    try {
      const member = await createStaff({
        fullName: values.fullName.trim(),
        email: values.email.trim().toLowerCase(),
        phone: normalizeBangladeshMobile(values.phone) ?? values.phone.trim(),
        role: values.role,
        password: values.password,
      });
      notifications.show({
        color: "success",
        title: "Staff member added",
        message: `${member.fullName} can now sign in as ${roleLabel(member.role).toLowerCase()} with ${member.email ?? "their email"}.`,
      });
      onClose();
    } catch (error) {
      if (!applyApiFieldErrors(form, error, FIELDS)) {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
      onBusyChange(false);
    }
  });

  const fillGenerated = () => {
    form.setFieldValue("password", generatePassword());
    setShowPassword(true);
  };

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        {formError ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
            {formError}
          </Alert>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <TextInput label="Full name" placeholder="e.g. Nusrat Jahan" withAsterisk autoComplete="off" data-autofocus {...form.getInputProps("fullName")} />
          <Select
            label="Role"
            placeholder="Choose a role"
            withAsterisk
            data={ROLE_OPTIONS}
            allowDeselect={false}
            comboboxProps={{ withinPortal: true }}
            renderOption={({ option }) => (
              <Box>
                <Text size="sm" fw={600}>
                  {option.label}
                </Text>
                <Text size="xs" c="var(--mo-color-text-muted)">
                  {roleDescription(option.value)}
                </Text>
              </Box>
            )}
            description={form.values.role ? ROLE_DESCRIPTIONS[form.values.role] : "What this person can see and do"}
            {...form.getInputProps("role")}
          />
          <TextInput label="Email" placeholder="name@myoxygen.com" type="email" withAsterisk autoComplete="off" description="Used to sign in" {...form.getInputProps("email")} />
          <TextInput
            label="Mobile number"
            placeholder="01712-345678"
            withAsterisk
            inputMode="tel"
            autoComplete="off"
            description="Bangladeshi mobile (01…, +880…)"
            {...form.getInputProps("phone")}
          />
        </SimpleGrid>

        <Box>
          <Group align="flex-end" gap="xs" wrap="nowrap">
            <PasswordInput
              label="Temporary password"
              description={`At least ${MIN_STAFF_PASSWORD} characters. Share it privately; they can sign in right away.`}
              withAsterisk
              autoComplete="new-password"
              visible={showPassword}
              onVisibilityChange={setShowPassword}
              style={{ flex: 1 }}
              aria-describedby="staff-password-strength"
              {...form.getInputProps("password")}
            />
            <Tooltip label="Generate a strong password" withArrow>
              <ActionIcon variant="light" color="secondaryGreen" size={36} radius="xl" onClick={fillGenerated} aria-label="Generate a strong password">
                <IconWand size={18} aria-hidden />
              </ActionIcon>
            </Tooltip>
            <CopyButton value={form.values.password} timeout={1600}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? "Copied" : "Copy password"} withArrow>
                  <ActionIcon
                    variant="default"
                    size={36}
                    radius="xl"
                    onClick={copy}
                    disabled={form.values.password.length === 0}
                    aria-label="Copy password"
                  >
                    {copied ? <IconCheck size={18} aria-hidden /> : <IconCopy size={18} aria-hidden />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <PasswordStrength value={form.values.password} id="staff-password-strength" />
        </Box>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" radius="xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" color="secondaryGreen.8" radius="xl" loading={submitting}>
            Add staff member
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
