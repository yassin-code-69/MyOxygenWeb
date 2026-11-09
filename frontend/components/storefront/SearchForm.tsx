"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ActionIcon, TextInput, type MantineSize } from "@mantine/core";
import { IconArrowRight, IconSearch } from "@tabler/icons-react";
import { startPageProgress } from "../PageProgressBar";

export interface SearchFormProps {
  placeholder?: string;
  size?: MantineSize;
  /** Show a submit arrow inside the pill (default `true`). */
  withSubmit?: boolean;
  /** Accessible label for the input. */
  label?: string;
  className?: string;
  /** Called after navigating (e.g. to close a drawer). */
  onSubmitted?: () => void;
}

/**
 * Pill search (`variant="search"`) that submits to `/products?q=…` — the catalog
 * explorer reads `q` from the URL and runs the trigram search.
 */
export function SearchForm({
  placeholder = "Search mother & baby essentials…",
  size = "md",
  withSubmit = true,
  label = "Search products",
  className,
  onSubmitted,
}: SearchFormProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = query.trim().slice(0, 100);
    startPageProgress();
    router.push(trimmed ? `/products?q=${encodeURIComponent(trimmed)}` : "/products");
    onSubmitted?.();
  };

  return (
    <form role="search" onSubmit={handleSubmit} className={className}>
      <TextInput
        aria-label={label}
        type="search"
        name="q"
        variant="search"
        size={size}
        value={query}
        maxLength={100}
        autoComplete="off"
        enterKeyHint="search"
        placeholder={placeholder}
        onChange={(event) => setQuery(event.currentTarget.value)}
        leftSection={<IconSearch size={18} stroke={1.8} aria-hidden />}
        rightSectionWidth={withSubmit ? 42 : undefined}
        rightSection={
          withSubmit ? (
            <ActionIcon type="submit" variant="filled" color="primaryPink" radius="xl" size={30} aria-label="Search">
              <IconArrowRight size={16} stroke={2.2} />
            </ActionIcon>
          ) : null
        }
      />
    </form>
  );
}
