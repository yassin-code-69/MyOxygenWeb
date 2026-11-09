"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconInfoCircle } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { getErrorMessage } from "../../../lib/api-client";
import { useCategories, useProductMutations } from "../../../hooks/admin/use-admin-products";
import type {
  AdminCategoryOption,
  AdminProductCreatePayload,
  AdminProductDTO,
  AdminProductUpdatePayload,
} from "../../../types/admin";
import { applyApiFieldErrors } from "../form-errors";
import { ImageListEditor, isValidImageRef, MAX_PRODUCT_IMAGES } from "./ImageListEditor";

const MAX_MONEY = 99_999_999.99;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

const hasAtMostTwoDecimals = (value: number): boolean => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;

const money = (label: string) =>
  z
    .number({ error: `Enter the ${label}` })
    .max(MAX_MONEY, `The ${label} is too large`)
    .refine(hasAtMostTwoDecimals, `The ${label} can have at most 2 decimals`);

/** Mirrors `updateProductSchema` in backend/src/routes/catalog.schema.ts. */
const editSchema = z.object({
  categoryId: z.string({ error: "Choose a category" }).min(1, "Choose a category"),
  title: z.string().trim().min(2, "Title must be at least 2 characters").max(255, "Title is too long"),
  brand: z.string().trim().max(120, "Brand is too long"),
  description: z.string().trim().min(1, "Add a description").max(10_000, "Description is too long"),
  basePrice: money("selling price").refine((value) => value > 0, "Selling price must be greater than 0"),
  costPrice: money("cost price").refine((value) => value >= 0, "Cost price can't be negative"),
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

/** Mirrors `createProductSchema` (sku required, slug optional). */
const createSchema = editSchema.extend({
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
});

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
  "images",
  "requiresBatchTracking",
  "lowStockThreshold",
  "isActive",
] as const;

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
      images: [],
      requiresBatchTracking: false,
      lowStockThreshold: 5,
      isActive: true,
    };
  }
  return {
    categoryId: product.category.id,
    title: product.title,
    slug: product.slug,
    sku: product.sku,
    brand: product.brand ?? "",
    description: product.description,
    basePrice: product.basePrice,
    costPrice: product.costPrice,
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
  if (Number(values.costPrice) !== Number(initial.costPrice)) {
    patch.costPrice = Number(values.costPrice);
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
      title={<Text fw={700}>{product ? `Edit ${product.title}` : "New product"}</Text>}
      closeOnClickOutside={false}
    >
      {opened ? <ProductForm key={product?.id ?? "new"} product={product} onClose={onClose} onSaved={onSaved} /> : null}
    </Modal>
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

  const handleSubmit = async (values: ProductFormValues) => {
    setFormError(null);
    setSubmitting(true);
    try {
      let saved: AdminProductDTO;
      if (product) {
        const patch = buildPatch(initialValues, values);
        if (Object.keys(patch).length === 0) {
          notifications.show({ color: "info", title: "No changes", message: "Nothing was changed, so nothing was saved." });
          onClose();
          return;
        }
        saved = await updateProduct(product.id, patch);
        notifications.show({ color: "success", title: "Product updated", message: saved.title });
      } else {
        const payload: AdminProductCreatePayload = {
          categoryId: values.categoryId ?? "",
          title: values.title.trim(),
          sku: values.sku.trim().toUpperCase(),
          brand: values.brand.trim() || null,
          description: values.description.trim(),
          basePrice: Number(values.basePrice),
          costPrice: Number(values.costPrice),
          images: values.images,
          requiresBatchTracking: values.requiresBatchTracking,
          lowStockThreshold: Number(values.lowStockThreshold),
          isActive: values.isActive,
        };
        if (values.slug.trim()) {
          payload.slug = values.slug.trim();
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

  const slugPreview = slugify(form.values.title);

  return (
    <form onSubmit={form.onSubmit(handleSubmit)} noValidate>
      <Stack gap="md">
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
            <TextInput label="Slug" value={form.values.slug} readOnly disabled description="Fixed after creation (keeps links stable)." />
          ) : (
            <TextInput
              label="Slug"
              placeholder={slugPreview || "generated-from-title"}
              description={slugPreview ? `Leave blank to use “${slugPreview}”.` : "Leave blank to generate it from the title."}
              {...form.getInputProps("slug")}
            />
          )}
          {isEdit ? (
            <TextInput label="SKU" value={form.values.sku} readOnly disabled description="Fixed after creation." />
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
            label="Cost price"
            withAsterisk
            leftSection="৳"
            min={0}
            decimalScale={2}
            thousandSeparator=","
            allowNegative={false}
            description="What the store pays. Never shown to customers."
            {...form.getInputProps("costPrice")}
          />
        </SimpleGrid>

        <Textarea label="Description" withAsterisk autosize minRows={3} maxRows={8} {...form.getInputProps("description")} />

        <ImageListEditor
          value={form.values.images}
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

        <Group justify="flex-end" gap="sm" mt="xs">
          <Button variant="default" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting}>
            {isEdit ? "Save changes" : "Create product"}
          </Button>
        </Group>
      </Stack>
    </form>
  );
}
