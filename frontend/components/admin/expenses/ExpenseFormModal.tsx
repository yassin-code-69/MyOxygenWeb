"use client";

import { useState } from "react";
import { Alert, Button, Group, Modal, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { IconAlertCircle, IconCalendar } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { getErrorMessage } from "../../../lib/api-client";
import { EXPENSE_LIMITS, type ExpenseCreatePayload, type ExpenseDTO } from "../../../types/admin-reports";
import { applyApiFieldErrors } from "../form-errors";
import { todayInDhaka } from "../format";
import { EXPENSE_CATEGORY_META, EXPENSE_CATEGORY_OPTIONS, isExpenseCategory } from "./expense-meta";

/** A type alias (not an interface) so it satisfies the resolver's `Record<string, unknown>`. */
type ExpenseFormValues = {
  category: string | null;
  amount: number | string;
  incurredOn: string | null;
  vendor: string;
  note: string;
};

const FIELDS = ["category", "amount", "incurredOn", "vendor", "note"] as const;

/** At most two decimals (paisa), tolerant of binary floating point. */
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** Mirrors `createExpenseSchema` (backend/src/routes/admin.schema.ts); "today" is the Dhaka calendar day. */
function buildSchema(today: string) {
  return z.object({
    category: z
      .string({ error: "Choose a category" })
      .refine((value) => isExpenseCategory(value), "Choose a category"),
    amount: z
      .number({ error: "Enter the amount" })
      .gt(0, "Amount must be greater than 0")
      .max(EXPENSE_LIMITS.maxAmount, "That amount is too large")
      .refine(hasAtMostTwoDecimals, "Use at most 2 decimals (paisa)"),
    incurredOn: z
      .string({ error: "Pick the date it was spent" })
      .min(1, "Pick the date it was spent")
      .refine((value) => value <= today, "The date can't be in the future"),
    vendor: z.string().trim().max(EXPENSE_LIMITS.vendor, `Keep the vendor under ${EXPENSE_LIMITS.vendor} characters`),
    note: z.string().trim().max(EXPENSE_LIMITS.note, `Keep the note under ${EXPENSE_LIMITS.note} characters`),
  });
}

export interface ExpenseFormModalProps {
  opened: boolean;
  /** `null` creates a new expense. */
  expense: ExpenseDTO | null;
  onClose: () => void;
  onSubmit: (payload: ExpenseCreatePayload) => Promise<void>;
}

/** Add / edit an operating expense (`POST` / `PATCH /admin/expenses`). */
export function ExpenseFormModal({ opened, expense, onClose, onSubmit }: ExpenseFormModalProps) {
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal
      opened={opened}
      onClose={submitting ? () => undefined : onClose}
      closeOnClickOutside={!submitting}
      closeOnEscape={!submitting}
      withCloseButton={!submitting}
      centered
      radius="md"
      title={<Text fw={700}>{expense ? "Edit expense" : "Add expense"}</Text>}
    >
      {opened ? (
        <ExpenseForm key={expense?.id ?? "new"} expense={expense} onClose={onClose} onSubmit={onSubmit} submitting={submitting} setSubmitting={setSubmitting} />
      ) : null}
    </Modal>
  );
}

function ExpenseForm({
  expense,
  onClose,
  onSubmit,
  submitting,
  setSubmitting,
}: Omit<ExpenseFormModalProps, "opened"> & { submitting: boolean; setSubmitting: (value: boolean) => void }) {
  const today = todayInDhaka();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ExpenseFormValues>({
    mode: "controlled",
    initialValues: {
      category: expense?.category ?? null,
      amount: expense?.amount ?? "",
      incurredOn: expense?.incurredOn ?? today,
      vendor: expense?.vendor ?? "",
      note: expense?.note ?? "",
    },
    validate: zod4Resolver(buildSchema(today)),
  });

  const handleSubmit = async (values: ExpenseFormValues) => {
    if (!values.category || !isExpenseCategory(values.category) || !values.incurredOn) {
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      await onSubmit({
        category: values.category,
        amount: Number(values.amount),
        incurredOn: values.incurredOn,
        vendor: values.vendor.trim() || null,
        note: values.note.trim() || null,
      });
      onClose();
    } catch (error) {
      if (!applyApiFieldErrors(form, error, FIELDS)) {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const category = form.values.category;
  const CategoryIcon = category && isExpenseCategory(category) ? EXPENSE_CATEGORY_META[category].icon : null;

  return (
    <form onSubmit={form.onSubmit((values) => void handleSubmit(values))} noValidate>
      <Stack gap="md">
        {formError ? (
          <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} title="The expense wasn't saved">
            {formError}
          </Alert>
        ) : null}
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
          <Select
            label="Category"
            placeholder="Choose a category"
            withAsterisk
            radius="md"
            data={EXPENSE_CATEGORY_OPTIONS}
            allowDeselect={false}
            leftSection={CategoryIcon ? <CategoryIcon size={16} aria-hidden /> : undefined}
            comboboxProps={{ withinPortal: true }}
            data-autofocus
            {...form.getInputProps("category")}
          />
          <NumberInput
            label="Amount"
            placeholder="0.00"
            withAsterisk
            radius="md"
            prefix="৳"
            min={0}
            decimalScale={2}
            thousandSeparator=","
            hideControls
            inputMode="decimal"
            {...form.getInputProps("amount")}
          />
        </SimpleGrid>
        <DatePickerInput
          label="Date spent"
          description="Counts towards net profit for this day (Dhaka time)."
          withAsterisk
          radius="md"
          valueFormat="DD MMM YYYY"
          maxDate={today}
          leftSection={<IconCalendar size={16} aria-hidden />}
          popoverProps={{ withinPortal: true }}
          {...form.getInputProps("incurredOn")}
        />
        <TextInput
          label="Vendor"
          placeholder="e.g. Pathao, Facebook Ads, landlord"
          radius="md"
          maxLength={EXPENSE_LIMITS.vendor}
          {...form.getInputProps("vendor")}
        />
        <Textarea
          label="Note"
          placeholder="What was it for?"
          radius="md"
          autosize
          minRows={2}
          maxRows={5}
          maxLength={EXPENSE_LIMITS.note}
          description={`${form.values.note.length}/${EXPENSE_LIMITS.note}`}
          inputWrapperOrder={["label", "input", "description", "error"]}
          {...form.getInputProps("note")}
        />
        <Group justify="flex-end" gap="sm">
          <Button variant="default" radius="xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" radius="xl" color="secondaryGreen.8" loading={submitting}>
            {expense ? "Save changes" : "Add expense"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
