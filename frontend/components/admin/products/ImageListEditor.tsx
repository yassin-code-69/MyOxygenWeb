"use client";

import { useState, type ReactNode } from "react";
import { ActionIcon, Box, Button, Group, Input, Paper, Stack, Text, TextInput, Tooltip } from "@mantine/core";
import { IconArrowDown, IconArrowUp, IconPhotoPlus, IconTrash } from "@tabler/icons-react";
import { ImageWithFallback } from "../../ImageWithFallback";

export const MAX_PRODUCT_IMAGES = 12;
const IMAGE_PATH_PATTERN = /^\/images\/[A-Za-z0-9._~\-/]+$/;

/** Mirrors the API rule: an http(s) URL or a `/images/...` path. */
export function isValidImageRef(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) {
    return false;
  }
  if (IMAGE_PATH_PATTERN.test(trimmed) && !trimmed.includes("..")) {
    return true;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export interface ImageListEditorProps {
  value: string[];
  onChange: (value: string[]) => void;
  error?: ReactNode;
  disabled?: boolean;
}

/** Ordered list of product image URLs: add, preview, reorder, remove. The first image is the cover. */
export function ImageListEditor({ value, onChange, error, disabled = false }: ImageListEditorProps) {
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState<string | null>(null);
  const full = value.length >= MAX_PRODUCT_IMAGES;

  const add = () => {
    const candidate = draft.trim();
    if (!isValidImageRef(candidate)) {
      setDraftError("Enter an http(s) image URL or a /images/... path.");
      return;
    }
    if (value.includes(candidate)) {
      setDraftError("This image is already in the list.");
      return;
    }
    onChange([...value, candidate]);
    setDraft("");
    setDraftError(null);
  };

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= value.length) {
      return;
    }
    const next = [...value];
    const [item] = next.splice(index, 1);
    if (item !== undefined) {
      next.splice(target, 0, item);
      onChange(next);
    }
  };

  return (
    <Input.Wrapper
      label="Images"
      description={`Up to ${MAX_PRODUCT_IMAGES}. The first image is the cover photo. Use full https:// links or /images/... paths.`}
      error={error}
    >
      <Stack gap="xs" mt={6}>
        {value.length === 0 ? (
          <Paper withBorder radius="md" p="sm" bg="var(--mo-color-surface-muted)">
            <Text size="sm" c="dimmed">
              No images yet. The storefront shows a neutral placeholder until you add one.
            </Text>
          </Paper>
        ) : null}
        {value.map((src, index) => (
          <Paper key={src} withBorder radius="md" p={6}>
            <Group gap="sm" wrap="nowrap">
              <Box w={48} h={48} style={{ flexShrink: 0, borderRadius: "var(--mo-radius-sm)", overflow: "hidden", position: "relative" }}>
                <ImageWithFallback src={src} alt={`Product image ${index + 1}`} fill sizes="48px" style={{ objectFit: "cover" }} />
              </Box>
              <Box style={{ flex: 1, minWidth: 0 }}>
                <Text size="xs" fw={600} c={index === 0 ? "var(--mo-color-text-brand)" : "dimmed"}>
                  {index === 0 ? "Cover" : `Image ${index + 1}`}
                </Text>
                <Text size="sm" truncate title={src}>
                  {src}
                </Text>
              </Box>
              <Group gap={2} wrap="nowrap">
                <Tooltip label="Move up">
                  <ActionIcon variant="subtle" color="gray" onClick={() => move(index, -1)} disabled={disabled || index === 0} aria-label={`Move image ${index + 1} up`}>
                    <IconArrowUp size={16} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Move down">
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    onClick={() => move(index, 1)}
                    disabled={disabled || index === value.length - 1}
                    aria-label={`Move image ${index + 1} down`}
                  >
                    <IconArrowDown size={16} aria-hidden />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Remove">
                  <ActionIcon
                    variant="subtle"
                    color="danger"
                    onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
                    disabled={disabled}
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <IconTrash size={16} aria-hidden />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>
          </Paper>
        ))}
        <Group gap="xs" align="flex-start" wrap="nowrap">
          <TextInput
            aria-label="Image URL"
            placeholder="https://… or /images/…"
            value={draft}
            onChange={(event) => {
              setDraft(event.currentTarget.value);
              setDraftError(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                add();
              }
            }}
            error={draftError}
            disabled={disabled || full}
            style={{ flex: 1 }}
          />
          <Button
            variant="light"
            leftSection={<IconPhotoPlus size={16} aria-hidden />}
            onClick={add}
            disabled={disabled || full || draft.trim().length === 0}
          >
            Add
          </Button>
        </Group>
      </Stack>
    </Input.Wrapper>
  );
}
