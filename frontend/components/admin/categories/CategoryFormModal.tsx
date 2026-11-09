"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Anchor,
  Box,
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
} from "@mantine/core";
import { useForm } from "@mantine/form";
import { notifications } from "@mantine/notifications";
import { IconAlertCircle, IconLock } from "@tabler/icons-react";
import { zod4Resolver } from "mantine-form-zod-resolver";
import { z } from "zod";
import { ImageWithFallback } from "../../ImageWithFallback";
import { useCategoryMutations } from "../../../hooks/admin/use-admin-categories";
import { getErrorMessage, isApiError } from "../../../lib/api-client";
import type {
  AdminCategory,
  AdminCategoryCreatePayload,
  AdminCategoryUpdatePayload,
} from "../../../types/admin-management";
import { applyApiFieldErrors } from "../form-errors";
import { descendantIds, slugify, toCategoryRows } from "./category-tree";
import { readListedProductCount } from "./category-errors";

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ICON_PATH_PATTERN = /^\/icons\/[A-Za-z0-9._~\-/]+$/;
const MAX_SORT_ORDER = 100_000;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Icon values the API accepts: an http(s) URL or a `/icons/...` path. */
export function isValidIconUrl(value: string): boolean {
  return (ICON_PATH_PATTERN.test(value) && !value.includes("..")) || isHttpUrl(value);
}

/** A type alias (not an interface) so it satisfies the resolver's `Record<string, unknown>`. */
type CategoryFormValues = {
  name: string;
  slug: string;
  parentId: string | null;
  iconUrl: string;
  sortOrder: number | string;
  isActive: boolean;
};

const FIELDS = ["name", "slug", "parentId", "iconUrl", "sortOrder", "isActive"] as const;

/** Mirrors `createCategorySchema` / `updateCategorySchema` (backend/src/routes/admin.catalog-meta.ts). */
function buildSchema(isEdit: boolean) {
  return z
    .object({
      name: z.string().trim().min(2, "Use at least 2 characters").max(255, "Keep the name under 255 characters"),
      slug: z.string().trim(),
      parentId: z.string().nullable(),
      iconUrl: z.string().trim().max(512, "Keep the link under 512 characters"),
      sortOrder: z.union([z.literal(""), z.number()]),
      isActive: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
      if (!isEdit) {
        if (values.slug === "") {
          issue("slug", "Enter a slug (lower-case letters, digits and hyphens)");
        } else if (values.slug.length > 200 || !SLUG_PATTERN.test(values.slug)) {
          issue("slug", "Use lower-case letters, digits and single hyphens, e.g. baby-care");
        }
      }
      if (values.iconUrl !== "" && !isValidIconUrl(values.iconUrl)) {
        issue("iconUrl", "Use an https:// link or a /icons/… path");
      }
      if (values.sortOrder !== "" && (!Number.isInteger(values.sortOrder) || values.sortOrder < 0 || values.sortOrder > MAX_SORT_ORDER)) {
        issue("sortOrder", `Use a whole number from 0 to ${MAX_SORT_ORDER.toLocaleString("en-IN")}`);
      }
    });
}

function initialValues(category: AdminCategory | null): CategoryFormValues {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parentId: category?.parentId ?? null,
    iconUrl: category?.iconUrl ?? "",
    sortOrder: category?.sortOrder ?? 0,
    isActive: category?.isActive ?? true,
  };
}

export interface CategoryFormModalProps {
  opened: boolean;
  /** `null` creates a new category. */
  category: AdminCategory | null;
  categories: readonly AdminCategory[];
  onClose: () => void;
  onSaved?: (category: AdminCategory) => void;
}

/**
 * Create / edit a category (`POST` / `PATCH /admin/catalog/categories`).
 * The slug is generated from the name until edited, and is read-only once
 * the category exists. The parent list leaves out the category itself and
 * everything below it. 409 duplicate slug and 422 field errors land on the
 * fields; a 409 on deactivation explains which products still use it.
 */
export function CategoryFormModal({ opened, category, categories, onClose, onSaved }: CategoryFormModalProps) {
  const [busy, setBusy] = useState(false);
  const close = () => {
    if (!busy) {
      onClose();
    }
  };
  return (
    <Modal
      opened={opened}
      onClose={close}
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      title={<Text fw={700}>{category ? "Edit category" : "Add category"}</Text>}
      size="lg"
      radius="md"
      centered
    >
      {opened ? (
        <CategoryForm
          key={category?.id ?? "new"}
          category={category}
          categories={categories}
          onClose={onClose}
          onSaved={onSaved}
          onBusyChange={setBusy}
        />
      ) : null}
    </Modal>
  );
}

interface CategoryFormProps extends Omit<CategoryFormModalProps, "opened"> {
  onBusyChange: (busy: boolean) => void;
}

function CategoryForm({ category, categories, onClose, onSaved, onBusyChange }: CategoryFormProps) {
  const isEdit = category !== null;
  const { createCategory, updateCategory } = useCategoryMutations();
  const [submitting, setSubmittingState] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listedCount, setListedCount] = useState<number | null>(null);
  const [slugEdited, setSlugEdited] = useState(false);
  const setSubmitting = (value: boolean) => {
    setSubmittingState(value);
    onBusyChange(value);
  };

  const form = useForm<CategoryFormValues>({
    mode: "controlled",
    initialValues: initialValues(category),
    validate: zod4Resolver(buildSchema(isEdit)),
  });

  const parentOptions = useMemo(() => {
    const blocked = category ? descendantIds(categories, category.id) : new Set<string>();
    return toCategoryRows(categories)
      .filter((row) => !blocked.has(row.id))
      .map((row) => ({
        value: row.id,
        label: `${row.depth > 0 ? `${"— ".repeat(row.depth)}` : ""}${row.name}${row.isActive ? "" : " (inactive)"}`,
      }));
  }, [categories, category]);

  const iconPreview = form.values.iconUrl.trim();
  const previewSrc = iconPreview !== "" && isValidIconUrl(iconPreview) ? iconPreview : null;

  const submit = form.onSubmit(async (values) => {
    setFormError(null);
    setListedCount(null);
    const sortOrder = typeof values.sortOrder === "number" ? values.sortOrder : 0;
    const iconUrl = values.iconUrl.trim() === "" ? null : values.iconUrl.trim();
    setSubmitting(true);
    try {
      let saved: AdminCategory;
      if (category) {
        const patch: AdminCategoryUpdatePayload = {};
        if (values.name.trim() !== category.name) {
          patch.name = values.name.trim();
        }
        if (values.parentId !== category.parentId) {
          patch.parentId = values.parentId;
        }
        if (iconUrl !== category.iconUrl) {
          patch.iconUrl = iconUrl;
        }
        if (sortOrder !== category.sortOrder) {
          patch.sortOrder = sortOrder;
        }
        if (values.isActive !== category.isActive) {
          patch.isActive = values.isActive;
        }
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        saved = await updateCategory(category.id, patch);
      } else {
        const payload: AdminCategoryCreatePayload = {
          name: values.name.trim(),
          slug: values.slug.trim(),
          iconUrl,
          parentId: values.parentId,
          sortOrder,
          isActive: values.isActive,
        };
        saved = await createCategory(payload);
      }
      notifications.show({
        color: "success",
        title: category ? "Category updated" : "Category created",
        message: `“${saved.name}” is saved${saved.isActive ? "" : " (inactive — hidden from the store)"}.`,
      });
      onSaved?.(saved);
      onClose();
    } catch (error) {
      const listed = readListedProductCount(error);
      if (listed !== null) {
        setListedCount(listed);
        form.setFieldError("isActive", "This category still has listed products.");
        return;
      }
      const mapped = applyApiFieldErrors(form, error, FIELDS);
      if (!mapped) {
        setFormError(isApiError(error) && error.status === 404 ? "This category no longer exists. Close and refresh the list." : getErrorMessage(error));
      }
    } finally {
      setSubmitting(false);
    }
  });

  return (
      <form onSubmit={submit} noValidate>
        <Stack gap="md">
          {formError ? (
            <Alert color="danger" variant="light" radius="md" icon={<IconAlertCircle size={18} aria-hidden />} role="alert">
              {formError}
            </Alert>
          ) : null}

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <TextInput
              label="Name"
              placeholder="e.g. Baby Bath"
              withAsterisk
              data-autofocus
              {...form.getInputProps("name")}
              onChange={(event) => {
                const name = event.currentTarget.value;
                form.setFieldValue("name", name);
                if (!isEdit && !slugEdited) {
                  form.setFieldValue("slug", slugify(name));
                }
              }}
            />
            <TextInput
              label="Slug"
              description={isEdit ? "Fixed once created (used in store links)" : "Used in store links; generated from the name"}
              placeholder="baby-bath"
              withAsterisk={!isEdit}
              readOnly={isEdit}
              rightSection={isEdit ? <IconLock size={14} aria-hidden /> : undefined}
              styles={{ input: { fontFamily: "var(--mo-font-monospace)" } }}
              {...form.getInputProps("slug")}
              onChange={(event) => {
                setSlugEdited(true);
                form.setFieldValue("slug", event.currentTarget.value.toLowerCase());
              }}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
            <Select
              label="Parent category"
              description="Leave empty for a top-level category"
              placeholder="Top level"
              data={parentOptions}
              clearable
              searchable
              nothingFoundMessage="No matching category"
              comboboxProps={{ withinPortal: true }}
              {...form.getInputProps("parentId")}
            />
            <NumberInput
              label="Sort order"
              description="Lower numbers appear first in the store"
              min={0}
              max={MAX_SORT_ORDER}
              allowDecimal={false}
              allowNegative={false}
              {...form.getInputProps("sortOrder")}
            />
          </SimpleGrid>

          <Group align="flex-start" gap="md" wrap="nowrap">
            <Box
              w={56}
              h={56}
              mt={24}
              style={{
                flex: "0 0 56px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                borderRadius: "var(--mo-radius-md)",
                border: "1px solid var(--mo-color-border)",
                backgroundColor: "var(--mo-color-surface-muted)",
                overflow: "hidden",
              }}
              aria-hidden
            >
              <ImageWithFallback src={previewSrc} alt="" width={40} height={40} sizes="40px" style={{ objectFit: "contain" }} />
            </Box>
            <TextInput
              label="Icon"
              description="A /icons/… file from the store, or an https:// image link. Preview on the left."
              placeholder="/icons/newborn.svg"
              style={{ flex: 1 }}
              {...form.getInputProps("iconUrl")}
            />
          </Group>

          <Box>
            <Switch
              label="Active (shown in the store)"
              description="Inactive categories are hidden from shoppers. A category can only be switched off once no listed product uses it."
              color="secondaryGreen"
              {...form.getInputProps("isActive", { type: "checkbox" })}
            />
            {listedCount !== null && category ? (
              <Alert color="warning" variant="light" radius="md" mt="sm" icon={<IconAlertCircle size={18} aria-hidden />} title="Still in use">
                <Text size="sm">
                  {listedCount === 1 ? "1 product is" : `${listedCount.toLocaleString("en-IN")} products are`} still listed in “{category.name}” (active or
                  waiting for stock). Move them to another category or deactivate them first.
                </Text>
                <Anchor component={Link} href={`/admin/products?category=${encodeURIComponent(category.slug)}`} size="sm" fw={600}>
                  View these products
                </Anchor>
              </Alert>
            ) : null}
          </Box>

          <Group justify="flex-end" gap="sm" mt="xs">
            <Button variant="default" radius="xl" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" color="secondaryGreen.8" radius="xl" loading={submitting}>
              {isEdit ? "Save changes" : "Create category"}
            </Button>
          </Group>
        </Stack>
      </form>
  );
}
