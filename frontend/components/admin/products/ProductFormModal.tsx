"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  ThemeIcon,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconCalculator, IconInfoCircle, IconPackage, IconPencil } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { getErrorMessage } from "../../../lib/api-client";
import { useCategories, useProductMutations } from "../../../hooks/admin/use-admin-products";
import {
  ADMIN_COST_COMPONENTS,
  type AdminCategoryOption,
  type AdminCostBreakdown,
  type AdminCostComponent,
  type AdminProductCreatePayload,
  type AdminProductDTO,
  type AdminProductUpdatePayload,
} from "../../../types/admin";
import { formatMoney, formatPercent } from "../format";
import { applyApiFieldErrors } from "../form-errors";
import { ImageListEditor, isValidImageRef, MAX_PRODUCT_IMAGES } from "./ImageListEditor";
import { COST_COMPONENT_LABELS, landedCost, marginColor, marginPercent } from "./pricing";

const MAX_MONEY = 99_999_999.99;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const hasAtMostTwoDecimals = (value: number): boolean => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const money = (label: string) =>
  z
    .number({ error: `Enter the ${label}` })
    .max(MAX_MONEY, `The ${label} is too large`)
    .refine(hasAtMostTwoDecimals, `The ${label} can have at most 2 decimals`);

/** Empty input or a number (validated against the cost mode in `superRefine`). */
const optionalAmount = z.union([z.literal(""), z.number()]);

/**
 * Mirrors `updateProductSchema` in backend/src/routes/catalog.schema.ts.
 * Cost rules (contract "Products: cost breakdown"): with the breakdown on,
 * each component is ≥ 0 and `costPrice` is their sum (not sent); with it off,
 * `costPrice` is required and ≥ 0.
 */
const baseSchema = z.object({
  categoryId: z.string({ error: "Choose a category" }).min(1, "Choose a category"),
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(255, "Title is too long"),
  brand: z.string().trim().max(120, "Brand is too long"),
  description: z.string().trim().min(1, "Add a description").max(10_000, "Description is too long"),
  basePrice: money("selling price").refine((value) => value > 0, "Selling price must be greater than 0"),
  costPrice: optionalAmount,
  useBreakdown: z.boolean(),
  supplierPrice: optionalAmount,
  shipping: optionalAmount,
  customsDuty: optionalAmount,
  packaging: optionalAmount,
  other: optionalAmount,
  images: z
    .array(z.string().refine(isValidImageRef, "Each image must be an http(s) URL or a /images/... path"))
    .max(MAX_PRODUCT_IMAGES, `At most ${MAX_PRODUCT_IMAGES} images`),
  requiresBatchTracking: z.boolean(),
  lowStockThreshold: z
    .number({ error: "Enter a low-stock alert level" })
    .int("Use a whole number")
    .min(0, "Can't be negative")
    .max(100_000, "Too large"),
  isActive: z.boolean(),
});

type CostValues = Pick<z.infer<typeof baseSchema>, "costPrice" | "useBreakdown" | AdminCostComponent>;

function refineCosts(values: CostValues, ctx: z.RefinementCtx): void {
  const check = (path: string, value: number | "", label: string, required: boolean) => {
    if (value === "") {
      if (required) {
        ctx.addIssue({ code: "custom", path: [path], message: `Enter the ${label}` });
      }
      return;
    }
    if (value < 0) {
      ctx.addIssue({ code: "custom", path: [path], message: `The ${label} can't be negative` });
    } else if (value > MAX_MONEY) {
      ctx.addIssue({ code: "custom", path: [path], message: `The ${label} is too large` });
    } else if (!hasAtMostTwoDecimals(value)) {
      ctx.addIssue({ code: "custom", path: [path], message: `The ${label} can have at most 2 decimals` });
    }
  };
  if (values.useBreakdown) {
    for (const key of ADMIN_COST_COMPONENTS) {
      check(key, values[key], COST_COMPONENT_LABELS[key].toLowerCase(), false);
    }
  } else {
    check("costPrice", values.costPrice, "cost price", true);
  }
}

const editSchema = baseSchema.superRefine(refineCosts);

/** Mirrors `createProductSchema` (sku required, slug optional). */
const createSchema = baseSchema
  .extend({
    slug: z.union([
      z.literal(""),
      z.string().trim().max(200, "Slug is too long").regex(SLUG_PATTERN, "Use lower-case letters, digits and single hyphens (e.g. rose-hip-serum)"),
    ]),
    sku: z
      .string()
      .trim()
      .min(2, "SKU must be at least 2 characters")
      .max(64, "SKU is too long")
      .regex(SKU_PATTERN, "Use letters, digits, '-' and '_' (start with a letter or digit)"),
  })
  .superRefine(refineCosts);

/** A type alias (not an interface) so it satisfies the resolver's `Record<string, unknown>`. */
type ProductFormValues = {
  categoryId: string | null;
  title: string;
  slug: string;
  sku: string;
  brand: string;
  description: string;
  basePrice: number | string;
  costPrice: number | string;
  /** Itemise the landed cost (costPrice = sum, not editable). */
  useBreakdown: boolean;
  supplierPrice: number | string;
  shipping: number | string;
  customsDuty: number | string;
  packaging: number | string;
  other: number | string;
  images: string[];
  requiresBatchTracking: boolean;
  lowStockThreshold: number | string;
  isActive: boolean;
};

const FIELD_NAMES = [
  "categoryId",
  "title",
  "slug",
  "sku",
  "brand",
  "description",
  "basePrice",
  "costPrice",
  "costBreakdown",
  ...ADMIN_COST_COMPONENTS,
  "images",
  "requiresBatchTracking",
  "lowStockThreshold",
  "isActive",
] as const;

function amountOf(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** The five components of the form as numbers (empty = 0, as the API treats omitted ones). */
function breakdownOf(values: ProductFormValues): AdminCostBreakdown {
  return {
    supplierPrice: amountOf(values.supplierPrice),
    shipping: amountOf(values.shipping),
    customsDuty: amountOf(values.customsDuty),
    packaging: amountOf(values.packaging),
    other: amountOf(values.other),
  };
}

function toFormValues(product: AdminProductDTO | null): ProductFormValues {
  if (!product) {
    return {
      categoryId: null,
      title: "",
      slug: "",
      sku: "",
      brand: "",
      description: "",
      basePrice: "",
      costPrice: "",
      useBreakdown: false,
      supplierPrice: "",
      shipping: "",
      customsDuty: "",
      packaging: "",
      other: "",
      images: [],
      requiresBatchTracking: false,
      lowStockThreshold: 5,
      isActive: true,
    };
  }
  const breakdown = product.costBreakdown ?? null;
  return {
    categoryId: product.category.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand ?? "",
    description: product.description,
    basePrice: product.basePrice,
    costPrice: product.costPrice,
    useBreakdown: breakdown !== null,
    supplierPrice: breakdown?.supplierPrice ?? "",
    shipping: breakdown?.shipping ?? "",
    customsDuty: breakdown?.customsDuty ?? "",
    packaging: breakdown?.packaging ?? "",
    other: breakdown?.other ?? "",
    images: [...product.images],
    requiresBatchTracking: product.requiresBatchTracking,
    lowStockThreshold: product.lowStockThreshold,
    isActive: product.isActive,
  };
}

/** `"Rose Hip Serum 30ml"` → `"rose-hip-serum-30ml"` (preview of the server's auto slug). */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200);
}

function categoryLabel(category: AdminCategoryOption, all: AdminCategoryOption[]): string {
  const parent = category.parentId ? all.find((item) => item.id === category.parentId) : undefined;
  return parent ? `${parent.name} › ${category.name}` : category.name;
}

function sameBreakdown(a: AdminCostBreakdown, b: AdminCostBreakdown): boolean {
  return ADMIN_COST_COMPONENTS.every((key) => Math.round(a[key] * 100) === Math.round(b[key] * 100));
}

/** Only the fields that differ from the loaded product (never overwrites untouched values). */
function buildPatch(initial: ProductFormValues, values: ProductFormValues): AdminProductUpdatePayload {
  const patch: AdminProductUpdatePayload = {};
  if (values.categoryId && values.categoryId !== initial.categoryId) {
    patch.categoryId = values.categoryId;
  }
  if (values.title.trim() !== initial.title.trim()) {
    patch.title = values.title.trim();
  }
  if (values.brand.trim() !== initial.brand.trim()) {
    patch.brand = values.brand.trim() || null;
  }
  if (values.description.trim() !== initial.description.trim()) {
    patch.description = values.description.trim();
  }
  if (Number(values.basePrice) !== Number(initial.basePrice)) {
    patch.basePrice = Number(values.basePrice);
  }
  // Cost: a breakdown always drives costPrice server-side, so never send both.
  if (values.useBreakdown) {
    const next = breakdownOf(values);
    if (!initial.useBreakdown || !sameBreakdown(next, breakdownOf(initial))) {
      patch.costBreakdown = next;
    }
  } else {
    if (initial.useBreakdown) {
      patch.costBreakdown = null;
    }
    if (Number(values.costPrice) !== Number(initial.costPrice)) {
      patch.costPrice = Number(values.costPrice);
    }
  }
  if (JSON.stringify(values.images) !== JSON.stringify(initial.images)) {
    patch.images = values.images;
  }
  if (values.requiresBatchTracking !== initial.requiresBatchTracking) {
    patch.requiresBatchTracking = values.requiresBatchTracking;
  }
  if (Number(values.lowStockThreshold) !== Number(initial.lowStockThreshold)) {
    patch.lowStockThreshold = Number(values.lowStockThreshold);
  }
  if (values.isActive !== initial.isActive) {
    patch.isActive = values.isActive;
  }
  return patch;
}

export interface ProductFormModalProps {
  opened: boolean;
  onClose: () => void;
  /** `null` creates a new product. */
  product: AdminProductDTO | null;
  onSaved?: (product: AdminProductDTO) => void;
}

/** Create / edit a product. Remounts per product so the form always starts from fresh values. */
export function ProductFormModal({ opened, onClose, product, onSaved }: ProductFormModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      radius="md"
      title={
        <Group gap="sm" wrap="nowrap">
          <ThemeIcon size={32} radius="md" variant="light" bg="var(--mo-color-secondary-1)" c="var(--mo-color-secondary-8)" aria-hidden>
            {product ? <IconPencil size={18} /> : <IconPackage size={18} />}
          </ThemeIcon>
          <Text fw={700} lineClamp={1}>
            {product ? `Edit ${product.title}` : "New product"}
          </Text>
        </Group>
      }
      closeOnClickOutside={false}
    >
      {opened ? <ProductForm key={product?.id ?? "new"} product={product} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text size="xs" fw={700} tt="uppercase" c="var(--mo-color-text-secondary)" style={{ letterSpacing: "0.05em" }}>
      {children}
    </Text>
  );
}

function ProductForm({ product, onClose, onSaved }: Omit<ProductFormModalProps, "opened">) {
  const isEdit = product !== null;
  const initialValues = useMemo(() => toFormValues(product), [product]);
  const form = useForm<ProductFormValues>({
    mode: "controlled",
    initialValues,
    validate: zod4Resolver(isEdit ? editSchema : createSchema),
  });
  const { data: categories, isLoading: categoriesLoading, error: categoriesError } = useCategories();
  const { createProduct, updateProduct } = useProductMutations();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const categoryOptions = useMemo(() => {
    const list = categories ?? [];
    const options = list.map((category) => ({ value: category.id, label: categoryLabel(category, list) }));
    // Keep the product's current category selectable even if it is no longer listed as active.
    if (product && !list.some((category) => category.id === product.category.id)) {
      options.unshift({ value: product.category.id, label: `${product.category.name} (hidden category)` });
    }
    return options;
  }, [categories, product]);

  const values = form.values;
  const breakdownTotal = landedCost(breakdownOf(values));
  const unitCost = values.useBreakdown ? breakdownTotal : amountOf(values.costPrice);
  const hasCost = values.useBreakdown || values.costPrice !== "";
  const basePrice = amountOf(values.basePrice);
  // Today's effective price is exact only while the base price is unchanged.
  const effectivePrice =
    product && product.effectivePrice < product.basePrice && basePrice === product.basePrice ? product.effectivePrice : null;

  const toggleBreakdown = (on: boolean) => {
    form.setFieldValue("useBreakdown", on);
    if (on && ADMIN_COST_COMPONENTS.every((key) => values[key] === "") && values.costPrice !== "") {
      // Start the itemisation from the current cost so the total doesn't jump to 0.
      form.setFieldValue("supplierPrice", amountOf(values.costPrice));
    }
    if (!on) {
      form.setFieldValue("costPrice", breakdownTotal);
    }
    form.clearFieldError("costPrice");
    form.clearFieldError("costBreakdown");
  };

  const handleSubmit = async (submitted: ProductFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      let saved: AdminProductDTO;
      if (product) {
        const patch = buildPatch(initialValues, submitted);
        if (Object.keys(patch).length === 0) {
          notifications.show({ color: "info", title: "No changes", message: "Nothing was changed, so nothing was saved." });
          onClose();
          return;
        }
        saved = await updateProduct(product.id, patch);
        notifications.show({ color: "success", title: "Product updated", message: saved.title });
      } else {
        const payload: AdminProductCreatePayload = {
          categoryId: submitted.categoryId ?? "",
          title: submitted.title.trim(),
          sku: submitted.sku.trim().toUpperCase(),
          brand: submitted.brand.trim() || null,
          description: submitted.description.trim(),
          basePrice: Number(submitted.basePrice),
          images: submitted.images,
          requiresBatchTracking: submitted.requiresBatchTracking,
          lowStockThreshold: Number(submitted.lowStockThreshold),
          isActive: submitted.isActive,
        };
        if (submitted.useBreakdown) {
          payload.costBreakdown = breakdownOf(submitted);
        } else {
          payload.costPrice = Number(submitted.costPrice);
        }
        if (submitted.slug.trim()) {
          payload.slug = submitted.slug.trim();
        }
        saved = await createProduct(payload);
        notifications.show({
          color: "success",
          title: "Product created",
          message: `${saved.title} is awaiting stock. Import its first batch on the Batches page to put it on sale.`,
          autoClose: 8000,
        });
      }
      onSaved?.(saved);
      onClose();
    } catch (error) {
      if (!applyApiFieldErrors(form, error, FIELD_NAMES)) {
        setFormError(getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const slugPreview = slugify(values.title);
  const baseMargin = hasCost ? marginPercent(basePrice, unitCost) : null;
  const effectiveMargin = effectivePrice !== null && hasCost ? marginPercent(effectivePrice, unitCost) : null;

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack gap="lg">
        {!isEdit ? (
          <Alert variant="light" color="info" radius="md" icon={<IconInfoCircle size={18} aria-hidden />}>
            New products start as <strong>Awaiting stock</strong>: they stay hidden from the storefront until their first
            batch is imported on the Batches page, then go live automatically.
          </Alert>
        ) : null}
        {formError ? (
          <Alert variant="light" color="danger" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} title="Couldn't save the product">
            {formError}
          </Alert>
        ) : null}

        <Stack gap="sm">
          <SectionTitle>Basics</SectionTitle>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput label="Title" withAsterisk {...form.getInputProps("title")} />
            <Select
              label="Category"
              withAsterisk
              searchable
              nothingFoundMessage="No matching category"
              placeholder={categoriesLoading ? "Loading categories…" : "Choose a category"}
              data={categoryOptions}
              disabled={categoriesLoading && !categories}
              {...form.getInputProps("categoryId")}
              error={form.errors.categoryId ?? (categoriesError ? "Categories couldn't be loaded. Close and try again." : undefined)}
            />
            {isEdit ? (
              <TextInput label="Slug" value={values.slug} readOnly disabled description="Fixed after creation (keeps links stable)." />
            ) : (
              <TextInput
                label="Slug"
                placeholder={slugPreview || "generated-from-title"}
                description={slugPreview ? `Leave blank to use “${slugPreview}”.` : "Leave blank to generate it from the title."}
                {...form.getInputProps("slug")}
              />
            )}
            {isEdit ? (
              <TextInput label="SKU" value={values.sku} readOnly disabled description="Fixed after creation." />
            ) : (
              <TextInput
                label="SKU"
                withAsterisk
                placeholder="e.g. DIAPER-NB-40"
                description="Letters, digits, '-' and '_'. Saved in upper case."
                {...form.getInputProps("sku")}
              />
            )}
            <TextInput label="Brand" placeholder="Optional" {...form.getInputProps("brand")} />
            <NumberInput
              label="Low-stock alert level"
              description="Flag the product when total stock falls to this number."
              min={0}
              max={100_000}
              allowDecimal={false}
              allowNegative={false}
              {...form.getInputProps("lowStockThreshold")}
            />
          </SimpleGrid>
          <Textarea label="Description" withAsterisk autosize minRows={3} maxRows={8} {...form.getInputProps("description")} />
        </Stack>

        <Divider color="var(--mo-color-border-subtle)" />

        <Stack gap="sm">
          <SectionTitle>Price & cost</SectionTitle>
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <NumberInput
              label="Selling price"
              withAsterisk
              leftSection="৳"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              allowNegative={false}
              description="Base price before any discount."
              {...form.getInputProps("basePrice")}
            />
            <NumberInput
              label="Cost price (landed)"
              withAsterisk={!values.useBreakdown}
              leftSection="৳"
              min={0}
              decimalScale={2}
              thousandSeparator=","
              allowNegative={false}
              description={values.useBreakdown ? "Calculated from the breakdown below." : "What one unit costs the store. Never shown to customers."}
              {...form.getInputProps("costPrice")}
              value={values.useBreakdown ? breakdownTotal : values.costPrice}
              readOnly={values.useBreakdown}
              variant={values.useBreakdown ? "filled" : "default"}
            />
          </SimpleGrid>

          <Paper withBorder radius="md" p="md" bg="var(--mo-color-surface-muted)">
            <Stack gap="sm">
              <Group justify="space-between" gap="sm" wrap="wrap">
                <Group gap="xs" wrap="nowrap">
                  <IconCalculator size={18} color="var(--mo-color-secondary-8)" aria-hidden />
                  <Text fw={600} size="sm">
                    Cost breakdown (per unit)
                  </Text>
                </Group>
                <Switch
                  label="Itemise landed cost"
                  checked={values.useBreakdown}
                  onChange={(event) => toggleBreakdown(event.currentTarget.checked)}
                />
              </Group>
              {values.useBreakdown ? (
                <>
                  <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="sm">
                    {ADMIN_COST_COMPONENTS.map((key) => (
                      <NumberInput
                        key={key}
                        label={COST_COMPONENT_LABELS[key]}
                        placeholder="0"
                        leftSection="৳"
                        min={0}
                        decimalScale={2}
                        thousandSeparator=","
                        allowNegative={false}
                        {...form.getInputProps(key)}
                      />
                    ))}
                    <Box>
                      <Text size="sm" fw={500} mb={6}>
                        Landed cost
                      </Text>
                      <Box
                        h={36}
                        px="sm"
                        display="flex"
                        style={{
                          alignItems: "center",
                          borderRadius: "var(--mo-radius-sm)",
                          backgroundColor: "var(--mo-color-secondary-0)",
                          border: "1px solid var(--mo-color-secondary-1)",
                        }}
                        aria-live="polite"
                      >
                        <Text fw={700} c="var(--mo-color-secondary-8)" className="mo-tabular-nums">
                          {formatMoney(breakdownTotal)}
                        </Text>
                      </Box>
                    </Box>
                  </SimpleGrid>
                  {form.errors.costBreakdown ? (
                    <Text size="xs" c="var(--mantine-color-error)" role="alert">
                      {form.errors.costBreakdown}
                    </Text>
                  ) : null}
                  <Text size="xs" c="var(--mo-color-text-secondary)">
                    The cost price is always the sum of these parts. Empty parts count as ৳0. Orders keep the cost that
                    applied when they were placed.
                  </Text>
                </>
              ) : (
                <Text size="xs" c="var(--mo-color-text-secondary)">
                  Split the landed cost into supplier price, shipping, customs, packaging and other costs to see where
                  the money goes. The cost price then follows their total.
                </Text>
              )}
            </Stack>
          </Paper>

          <MarginPreview
            basePrice={basePrice}
            unitCost={unitCost}
            hasCost={hasCost}
            baseMargin={baseMargin}
            effectivePrice={effectivePrice}
            effectiveMargin={effectiveMargin}
          />
        </Stack>

        <Divider color="var(--mo-color-border-subtle)" />

        <Stack gap="sm">
          <SectionTitle>Images & visibility</SectionTitle>
          <ImageListEditor
            value={values.images}
            onChange={(images) => form.setFieldValue("images", images)}
            error={form.errors.images}
            disabled={submitting}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Switch
              label="Track batches and expiry"
              description="For perishable items (skincare, food): stock is sold first-expired, first-out."
              {...form.getInputProps("requiresBatchTracking", { type: "checkbox" })}
            />
            <Switch
              label="Listed on the storefront"
              description="Turn off to keep the product hidden even when it has stock."
              {...form.getInputProps("isActive", { type: "checkbox" })}
            />
          </SimpleGrid>
        </Stack>

        <Group justify="flex-end" gap="sm">
          <Button variant="default" radius="xl" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" radius="xl" color="secondaryGreen.8" loading={submitting}>
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}

interface MarginPreviewProps {
  basePrice: number;
  unitCost: number;
  hasCost: boolean;
  baseMargin: number | null;
  effectivePrice: number | null;
  effectiveMargin: number | null;
}

/** Live margin preview: base price (and today's discounted price) vs the landed cost. */
function MarginPreview({ basePrice, unitCost, hasCost, baseMargin, effectivePrice, effectiveMargin }: MarginPreviewProps) {
  if (!(basePrice > 0) || !hasCost) {
    return (
      <Text size="xs" c="var(--mo-color-text-secondary)">
        Enter the selling price and the cost to preview the margin.
      </Text>
    );
  }
  const rows: { label: string; price: number; margin: number | null }[] = [{ label: "At the base price", price: basePrice, margin: baseMargin }];
  if (effectivePrice !== null) {
    rows.push({ label: "At today's discounted price", price: effectivePrice, margin: effectiveMargin });
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: rows.length }} spacing="sm" aria-live="polite">
      {rows.map((row) => {
        const profit = row.price - unitCost;
        const color = marginColor(row.margin);
        return (
          <Paper key={row.label} withBorder radius="md" p="sm">
            <Text size="xs" c="var(--mo-color-text-secondary)">
              {row.label} ({formatMoney(row.price)})
            </Text>
            <Group justify="space-between" align="baseline" mt={4} gap="xs" wrap="nowrap">
              <Text size="sm" className="mo-tabular-nums">
                Profit{" "}
                <Text component="span" fw={700} c={profit < 0 ? "var(--mo-color-text-danger)" : "var(--mo-color-text)"}>
                  {profit < 0 ? "−" : ""}
                  {formatMoney(Math.abs(profit))}
                </Text>{" "}
                / unit
              </Text>
              <Text fw={700} c={`var(--mantine-color-${color}-8)`} className="mo-tabular-nums">
                {formatPercent(row.margin)} margin
              </Text>
            </Group>
          </Paper>
        );
      })}
    </SimpleGrid>
  );
}
