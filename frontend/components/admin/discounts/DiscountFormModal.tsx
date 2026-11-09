"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCalendarEvent, IconInfoCircle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { useCategories } from "../../../hooks/admin/use-admin-products";
import { useDiscountMutations } from "../../../hooks/admin/use-discounts";
import { getErrorMessage } from "../../../lib/api-client";
import type {
  AdminDiscountCreatePayload,
  AdminDiscountDTO,
  AdminDiscountKind,
  AdminDiscountScope,
  AdminDiscountType,
  AdminDiscountUpdatePayload,
} from "../../../types/admin";
import { dhakaWallTimeToIso, dhakaWallTimeToMs, isoToDhakaWallTime, todayInDhaka } from "../format";
import { applyApiFieldErrors } from "../form-errors";
import { ProductPicker, type ProductOption } from "../ProductPicker";

const MAX_MONEY = 99_999_999.99;
const hasAtMostTwoDecimals = (value: number): boolean => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

/** A type alias (not an interface) so it satisfies the resolver's `Record<string, unknown>`. */
type DiscountFormValues = {
  kind: AdminDiscountKind;
  code: string;
  name: string;
  type: AdminDiscountType;
  value: number | string;
  scope: AdminDiscountScope;
  productId: string | null;
  categoryId: string | null;
  minOrderAmount: number | string;
  maxDiscountAmount: number | string;
  usageLimit: number | string;
  perCustomerLimit: number | string;
  /** Dhaka wall-clock `YYYY-MM-DD HH:mm:ss`; empty = start now. */
  startsAt: string | null;
  endsAt: string | null;
  isFlashSale: boolean;
  isActive: boolean;
};

const FIELDS = [
  "kind",
  "code",
  "name",
  "type",
  "value",
  "scope",
  "productId",
  "categoryId",
  "minOrderAmount",
  "maxDiscountAmount",
  "usageLimit",
  "perCustomerLimit",
  "startsAt",
  "endsAt",
  "isFlashSale",
  "isActive",
] as const;

const optionalNumber = z.union([z.literal(""), z.number()]);

/** Mirrors `createDiscountSchema` + `validateDiscountState` (backend/src/routes/catalog.schema.ts, discount.service.ts). */
function buildSchema(options: { isEdit: boolean; usageCount: number; originalEndsAt: string | null }) {
  return z
    .object({
      kind: z.enum(["AUTOMATIC", "COUPON"]),
      code: z.string().trim(),
      name: z.string().trim().max(160, "Keep the name under 160 characters"),
      type: z.enum(["PERCENTAGE", "FIXED_AMOUNT"]),
      value: z.number({ error: "Enter the discount value" }),
      scope: z.enum(["STORE", "PRODUCT", "CATEGORY"]),
      productId: z.string().nullable(),
      categoryId: z.string().nullable(),
      minOrderAmount: optionalNumber,
      maxDiscountAmount: optionalNumber,
      usageLimit: optionalNumber,
      perCustomerLimit: optionalNumber,
      startsAt: z.string().nullable(),
      endsAt: z.string({ error: "Pick when the discount ends" }).min(1, "Pick when the discount ends"),
      isFlashSale: z.boolean(),
      isActive: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (values.kind === "COUPON" && !options.isEdit) {
        if (values.code.length < 3 || values.code.length > 64) {
          issue("code", "Coupon codes are 3–64 characters");
        } else if (!/^[A-Za-z0-9_-]+$/.test(values.code)) {
          issue("code", "Use letters, digits, '-' and '_'");
        }
      }
      if (!(values.value > 0)) {
        issue("value", "Must be greater than 0");
      } else if (values.type === "PERCENTAGE" && values.value > 100) {
        issue("value", "A percentage can't exceed 100");
      } else if (values.value > MAX_MONEY || !hasAtMostTwoDecimals(values.value)) {
        issue("value", "Use at most 2 decimals");
      }
      if (values.scope === "PRODUCT" && !values.productId) {
        issue("productId", "Choose the product");
      }
      if (values.scope === "CATEGORY" && !values.categoryId) {
        issue("categoryId", "Choose the category");
      }
      if (values.maxDiscountAmount !== "" && !(values.maxDiscountAmount > 0)) {
        issue("maxDiscountAmount", "Must be greater than 0");
      }
      if (values.kind === "COUPON") {
        if (values.minOrderAmount !== "" && values.minOrderAmount < 0) {
          issue("minOrderAmount", "Can't be negative");
        }
        if (values.usageLimit !== "") {
          if (!Number.isInteger(values.usageLimit) || values.usageLimit < 1 || values.usageLimit > 10_000_000) {
            issue("usageLimit", "Use a whole number from 1");
          } else if (values.usageLimit < options.usageCount) {
            issue("usageLimit", `Already used ${options.usageCount} times — the limit can't be lower`);
          }
        }
        if (values.perCustomerLimit !== "" && (!Number.isInteger(values.perCustomerLimit) || values.perCustomerLimit < 1 || values.perCustomerLimit > 10_000)) {
          issue("perCustomerLimit", "Use a whole number from 1 to 10,000");
        }
      }
      if (values.endsAt) {
        const end = dhakaWallTimeToMs(values.endsAt);
        const start = values.startsAt ? dhakaWallTimeToMs(values.startsAt) : Date.now();
        if (end <= start) {
          issue("endsAt", "Must be after the start");
        }
        const endChanged = !options.isEdit || values.endsAt !== options.originalEndsAt;
        if (endChanged && end <= Date.now()) {
          issue("endsAt", "Must be in the future");
        }
      }
    });
}

function toNumberOrEmpty(value: number | null): number | string {
  return value === null ? "" : value;
}

function toFormValues(discount: AdminDiscountDTO | null, preset: DiscountPreset): DiscountFormValues {
  if (discount) {
    return {
      kind: discount.kind,
      code: discount.code ?? "",
      name: discount.name ?? "",
      type: discount.type,
      value: discount.value,
      scope: discount.scope,
      productId: discount.productId,
      categoryId: discount.categoryId,
      minOrderAmount: toNumberOrEmpty(discount.minOrderAmount),
      maxDiscountAmount: toNumberOrEmpty(discount.maxDiscountAmount),
      usageLimit: toNumberOrEmpty(discount.usageLimit),
      perCustomerLimit: toNumberOrEmpty(discount.perCustomerLimit),
      startsAt: isoToDhakaWallTime(discount.startsAt),
      endsAt: isoToDhakaWallTime(discount.endsAt),
      isFlashSale: discount.isFlashSale,
      isActive: discount.isActive,
    };
  }
  return {
    kind: preset.kind,
    code: "",
    name: "",
    type: "PERCENTAGE",
    value: "",
    scope: preset.product ? "PRODUCT" : "STORE",
    productId: preset.product?.id ?? null,
    categoryId: null,
    minOrderAmount: "",
    maxDiscountAmount: "",
    usageLimit: "",
    perCustomerLimit: "",
    startsAt: null,
    endsAt: null,
    isFlashSale: false,
    isActive: true,
  };
}

const emptyToNull = (value: number | string): number | null => (value === "" ? null : Number(value));

function targets(values: DiscountFormValues): { productId: string | null; categoryId: string | null } {
  return {
    productId: values.scope === "PRODUCT" ? values.productId : null,
    categoryId: values.scope === "CATEGORY" ? values.categoryId : null,
  };
}

function buildCreatePayload(values: DiscountFormValues): AdminDiscountCreatePayload {
  const coupon = values.kind === "COUPON";
  const payload: AdminDiscountCreatePayload = {
    code: coupon ? values.code.trim().toUpperCase() : null,
    name: values.name.trim() || null,
    type: values.type,
    value: Number(values.value),
    ...targets(values),
    maxDiscountAmount: emptyToNull(values.maxDiscountAmount),
    endsAt: dhakaWallTimeToIso(values.endsAt ?? ""),
    isActive: values.isActive,
  };
  if (values.startsAt) {
    payload.startsAt = dhakaWallTimeToIso(values.startsAt);
  }
  if (coupon) {
    payload.minOrderAmount = emptyToNull(values.minOrderAmount);
    payload.usageLimit = emptyToNull(values.usageLimit);
    payload.perCustomerLimit = emptyToNull(values.perCustomerLimit);
  } else {
    payload.isFlashSale = values.isFlashSale;
  }
  return payload;
}

function buildPatch(initial: DiscountFormValues, values: DiscountFormValues): AdminDiscountUpdatePayload {
  const patch: AdminDiscountUpdatePayload = {};
  const coupon = values.kind === "COUPON";
  if (values.name.trim() !== initial.name.trim()) {
    patch.name = values.name.trim() || null;
  }
  if (values.type !== initial.type) {
    patch.type = values.type;
  }
  if (Number(values.value) !== Number(initial.value)) {
    patch.value = Number(values.value);
  }
  const nextTargets = targets(values);
  const prevTargets = targets(initial);
  if (nextTargets.productId !== prevTargets.productId || nextTargets.categoryId !== prevTargets.categoryId) {
    patch.productId = nextTargets.productId;
    patch.categoryId = nextTargets.categoryId;
  }
  if (emptyToNull(values.maxDiscountAmount) !== emptyToNull(initial.maxDiscountAmount)) {
    patch.maxDiscountAmount = emptyToNull(values.maxDiscountAmount);
  }
  if (coupon) {
    if (emptyToNull(values.minOrderAmount) !== emptyToNull(initial.minOrderAmount)) {
      patch.minOrderAmount = emptyToNull(values.minOrderAmount);
    }
    if (emptyToNull(values.usageLimit) !== emptyToNull(initial.usageLimit)) {
      patch.usageLimit = emptyToNull(values.usageLimit);
    }
    if (emptyToNull(values.perCustomerLimit) !== emptyToNull(initial.perCustomerLimit)) {
      patch.perCustomerLimit = emptyToNull(values.perCustomerLimit);
    }
  } else if (values.isFlashSale !== initial.isFlashSale) {
    patch.isFlashSale = values.isFlashSale;
  }
  if (values.startsAt && values.startsAt !== initial.startsAt) {
    patch.startsAt = dhakaWallTimeToIso(values.startsAt);
  }
  if (values.endsAt && values.endsAt !== initial.endsAt) {
    patch.endsAt = dhakaWallTimeToIso(values.endsAt);
  }
  if (values.isActive !== initial.isActive) {
    patch.isActive = values.isActive;
  }
  return patch;
}

export interface DiscountPreset {
  kind: AdminDiscountKind;
  /** Pre-selected product (shortcut from the products page). */
  product?: ProductOption | null;
}

export interface DiscountFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** `null` creates a new discount. */
  discount: AdminDiscountDTO | null;
  preset?: DiscountPreset;
}

/** Create / edit a coupon or automatic discount (incl. flash sales). */
export function DiscountFormModal({ opened, onClose, discount, preset = { kind: "COUPON" } }: DiscountFormModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      closeOnClickOutside={false}
      title={<Text fw={700}>{discount ? `Edit ${discount.code ?? discount.name ?? "discount"}` : "New discount"}</Text>}
    >
      {opened ? (
        <DiscountForm key={discount?.id ?? `new-${preset.kind}-${preset.product?.id ?? ""}`} discount={discount} preset={preset} onClose={onClose} />
      ) : null}
    </Modal>
  );
}

function DiscountForm({ discount, preset, onClose }: { discount: AdminDiscountDTO | null; preset: DiscountPreset; onClose: () => void }) {
  const isEdit = discount !== null;
  const initialValues = useMemo(() => toFormValues(discount, preset), [discount, preset]);
  const form = useForm<DiscountFormValues>({
    mode: "controlled",
    initialValues,
    validate: zod4Resolver(
      buildSchema({ isEdit, usageCount: discount?.usageCount ?? 0, originalEndsAt: initialValues.endsAt }),
    ),
  });
  const { data: categories } = useCategories();
  const { createDiscount, updateDiscount } = useDiscountMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const values = form.values;
  const coupon = values.kind === "COUPON";
  const today = todayInDhaka();

  const categoryOptions = useMemo(() => {
    const options = (categories ?? []).map((category) => ({ value: category.id, label: category.name }));
    if (discount?.category && !options.some((option) => option.value === discount.category?.id)) {
      options.unshift({ value: discount.category.id, label: discount.category.name });
    }
    return options;
  }, [categories, discount]);

  const initialProduct: ProductOption | null = discount?.product
    ? { id: discount.product.id, title: discount.product.title, sku: "" }
    : (preset.product ?? null);

  const handleSubmit = async (submitted: DiscountFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      if (discount) {
        const patch = buildPatch(initialValues, submitted);
        if (Object.keys(patch).length === 0) {
          notifications.show({ color: "info", title: "No changes", message: "Nothing was changed, so nothing was saved." });
          onClose();
          return;
        }
        const saved = await updateDiscount(discount.id, patch);
        notifications.show({ color: "success", title: "Discount updated", message: saved.code ?? saved.name ?? "Saved" });
      } else {
        const saved = await createDiscount(buildCreatePayload(submitted));
        notifications.show({
          color: "success",
          title: saved.kind === "COUPON" ? "Coupon created" : saved.isFlashSale ? "Flash sale created" : "Discount created",
          message:
            saved.status === "SCHEDULED"
              ? "It starts automatically at the chosen time."
              : saved.kind === "COUPON"
                ? `Customers can use ${saved.code ?? "the code"} at checkout now.`
                : "Storefront prices update right away.",
        });
      }
      onClose();
    } catch (error) {
      if (!applyApiFieldErrors(form, error, FIELDS)) {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack gap="md">
        {formError ? (
          <Alert variant="light" color="danger" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} title="Couldn't save the discount">
            {formError}
          </Alert>
        ) : null}

        <SegmentedControl
          fullWidth
          disabled={isEdit}
          value={values.kind}
          onChange={(next) => {
            const kind: AdminDiscountKind = next === "AUTOMATIC" ? "AUTOMATIC" : "COUPON";
            form.setFieldValue("kind", kind);
            if (kind === "COUPON") {
              form.setFieldValue("isFlashSale", false);
            }
          }}
          data={[
            { value: "COUPON", label: "Coupon code" },
            { value: "AUTOMATIC", label: "Automatic (price drop)" },
          ]}
          aria-label="Discount kind"
        />
        <Text size="xs" c="dimmed" mt={-8}>
          {coupon
            ? "Customers type the code at checkout. Limits and a minimum order are optional."
            : "Applied to storefront prices automatically — no code needed. Mark it as a flash sale to show a countdown."}
          {isEdit ? " The kind and code can't change after creation." : ""}
        </Text>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {coupon ? (
            <TextInput
              label="Coupon code"
              withAsterisk={!isEdit}
              disabled={isEdit}
              placeholder="e.g. NEWMOM10"
              description={isEdit ? "Fixed after creation." : "3–64 letters, digits, '-' or '_'. Saved in upper case."}
              {...form.getInputProps("code")}
              onChange={(event) => form.setFieldValue("code", event.currentTarget.value.toUpperCase())}
            />
          ) : null}
          <TextInput label="Name" placeholder="Shown to customers (optional)" {...form.getInputProps("name")} />
          <Select
            label="Type"
            allowDeselect={false}
            data={[
              { value: "PERCENTAGE", label: "Percentage off" },
              { value: "FIXED_AMOUNT", label: "Fixed amount off (৳)" },
            ]}
            {...form.getInputProps("type")}
          />
          <NumberInput
            label="Value"
            withAsterisk
            min={0}
            max={values.type === "PERCENTAGE" ? 100 : undefined}
            decimalScale={2}
            allowNegative={false}
            leftSection={values.type === "PERCENTAGE" ? "%" : "৳"}
            {...form.getInputProps("value")}
          />
          <NumberInput
            label="Maximum discount (৳)"
            placeholder="No cap"
            description="Caps a percentage discount."
            min={0}
            decimalScale={2}
            allowNegative={false}
            {...form.getInputProps("maxDiscountAmount")}
          />
        </SimpleGrid>

        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Applies to
          </Text>
          <SegmentedControl
            value={values.scope}
            onChange={(next) => form.setFieldValue("scope", next === "PRODUCT" ? "PRODUCT" : next === "CATEGORY" ? "CATEGORY" : "STORE")}
            data={[
              { value: "STORE", label: "Whole store" },
              { value: "CATEGORY", label: "A category" },
              { value: "PRODUCT", label: "A product" },
            ]}
            aria-label="Discount scope"
          />
          {values.scope === "PRODUCT" ? (
            <ProductPicker
              withAsterisk
              value={values.productId}
              onChange={(id) => form.setFieldValue("productId", id)}
              error={form.errors.productId}
              initialProduct={initialProduct}
            />
          ) : null}
          {values.scope === "CATEGORY" ? (
            <Select
              label="Category"
              withAsterisk
              searchable
              nothingFoundMessage="No matching category"
              data={categoryOptions}
              {...form.getInputProps("categoryId")}
            />
          ) : null}
        </Stack>

        {coupon ? (
          <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
            <NumberInput
              label="Minimum order (৳)"
              placeholder="None"
              min={0}
              decimalScale={2}
              allowNegative={false}
              {...form.getInputProps("minOrderAmount")}
            />
            <NumberInput
              label="Total uses"
              placeholder="Unlimited"
              description={isEdit && discount ? `Used ${discount.usageCount} times so far.` : undefined}
              min={1}
              allowDecimal={false}
              allowNegative={false}
              {...form.getInputProps("usageLimit")}
            />
            <NumberInput
              label="Uses per customer"
              placeholder="Unlimited"
              min={1}
              allowDecimal={false}
              allowNegative={false}
              {...form.getInputProps("perCustomerLimit")}
            />
          </SimpleGrid>
        ) : null}

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          <DateTimePicker
            label="Starts"
            placeholder={isEdit ? "Unchanged" : "Right away"}
            description="Dhaka time"
            clearable={!isEdit}
            minDate={isEdit ? undefined : today}
            valueFormat="D MMM YYYY, h:mm A"
            leftSection={<IconCalendarEvent size={16} aria-hidden />}
            {...form.getInputProps("startsAt")}
          />
          <DateTimePicker
            label="Ends"
            withAsterisk
            placeholder="Pick date and time"
            description="Dhaka time"
            minDate={today}
            valueFormat="D MMM YYYY, h:mm A"
            leftSection={<IconCalendarEvent size={16} aria-hidden />}
            {...form.getInputProps("endsAt")}
          />
        </SimpleGrid>

        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
          {!coupon ? (
            <Switch
              label="Flash sale"
              description="Shows a countdown badge on the storefront."
              {...form.getInputProps("isFlashSale", { type: "checkbox" })}
            />
          ) : null}
          <Switch label="Active" description="Turn off to pause it without deleting." {...form.getInputProps("isActive", { type: "checkbox" })} />
        </SimpleGrid>

        {!coupon && values.scope === "STORE" ? (
          <Alert variant="light" color="info" radius="md" icon={<IconInfoCircle size={18} aria-hidden />}>
            A store-wide automatic discount lowers the price of every product while it runs.
          </Alert>
        ) : null}

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {isEdit ? "Save changes" : "Create discount"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
