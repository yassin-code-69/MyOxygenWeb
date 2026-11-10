"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ActionIcon,
  Badge,
  Combobox,
  Group,
  Highlight,
  Loader,
  Text,
  TextInput,
  UnstyledButton,
  VisuallyHidden,
  useCombobox,
  type MantineSize,
} from "@mantine/core";
import { IconArrowRight, IconSearch } from "@tabler/icons-react";
import { ImageWithFallback } from "../ImageWithFallback";
import { startPageProgress } from "../PageProgressBar";
import { Price } from "../Price";
import {
  normalizeSearchTerm,
  SUGGESTIONS_MIN_LENGTH,
  useSearchSuggestions,
} from "../../hooks/catalog/use-search-suggestions";
import type { ProductSuggestionDTO } from "../../types/catalog";
import classes from "./SearchForm.module.css";

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

/** Highlight each typed word of 2+ characters inside the title. */
function highlightWords(term: string): string[] {
  return term.split(" ").filter((word) => word.length >= 2);
}

function SuggestionRow({ item, term }: { item: ProductSuggestionDTO; term: string }) {
  const discounted = item.effectivePrice < item.basePrice;
  const meta = [item.brand, item.category.name].filter(Boolean).join(" · ");
  return (
    <Group gap="sm" wrap="nowrap">
      <div className={classes.thumb}>
        <ImageWithFallback src={item.image} alt="" width={44} height={44} sizes="44px" className={classes.thumbImage} />
      </div>
      <div className={classes.text}>
        <Highlight
          highlight={highlightWords(term)}
          size="sm"
          fw={600}
          lh={1.35}
          lineClamp={2}
          highlightStyles={{ backgroundColor: "transparent", color: "var(--mo-color-text-brand)", padding: 0 }}
        >
          {item.title}
        </Highlight>
        {meta ? (
          <Text size="xs" c="dimmed" lineClamp={1}>
            {meta}
          </Text>
        ) : null}
      </div>
      <div className={classes.priceColumn}>
        <Price value={item.effectivePrice} compareAt={discounted ? item.basePrice : undefined} size="sm" tone="brand" />
        {item.isOutOfStock ? (
          <Badge size="xs" variant="light" color="gray">
            Out of stock
          </Badge>
        ) : null}
      </div>
    </Group>
  );
}

/**
 * Pill search (`variant="search"`) with search as you type.
 *
 * - Typing 2+ characters shows up to 6 matching products (typo tolerant,
 *   same ranking as the catalog) with image, price and stock.
 * - ↑/↓ choose a product and Enter opens it. Enter without a choice, the
 *   arrow button or "See all results" goes to `/products?q=…`, where the
 *   catalog explorer runs the full search.
 * - Esc or leaving the field closes the list.
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const combobox = useCombobox({ onDropdownClose: () => combobox.resetSelectedOption() });
  const { term, enabled, data, error, isFetching } = useSearchSuggestions(query);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  const finish = () => {
    combobox.closeDropdown();
    inputRef.current?.blur();
    onSubmitted?.();
  };

  const goToResults = () => {
    startPageProgress();
    router.push(term ? `/products?q=${encodeURIComponent(term)}` : "/products");
    finish();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    goToResults();
  };

  const openProduct = (slug: string) => {
    startPageProgress();
    router.push(`/products/${encodeURIComponent(slug)}`);
    setQuery("");
    finish();
  };

  const searching = items.length === 0 && !error && (isFetching || data === undefined);
  let status: string | null = null;
  if (items.length === 0) {
    if (error) {
      status = "Couldn't load suggestions. Press Enter to search.";
    } else if (searching) {
      status = "Searching…";
    } else {
      status = `No products match “${term}”.`;
    }
  }

  return (
    <form role="search" onSubmit={handleSubmit} className={className}>
      <Combobox
        store={combobox}
        onOptionSubmit={openProduct}
        position="bottom-start"
        offset={6}
        shadow="md"
        radius="md"
        transitionProps={{ transition: "pop-top-left", duration: 120 }}
      >
        <Combobox.Target withExpandedAttribute>
          <TextInput
            ref={inputRef}
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
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              combobox.resetSelectedOption();
              // Esc on a search field also clears it: keep the list closed (and
              // aria-expanded false) whenever there is nothing to suggest.
              if (normalizeSearchTerm(value).length >= SUGGESTIONS_MIN_LENGTH) {
                combobox.openDropdown();
              } else {
                combobox.closeDropdown();
              }
            }}
            onFocus={() => {
              if (enabled) {
                combobox.openDropdown();
              }
            }}
            onBlur={() => combobox.closeDropdown()}
            leftSection={
              isFetching && items.length > 0 ? (
                <Loader size={16} color="primaryPink" aria-hidden />
              ) : (
                <IconSearch size={18} stroke={1.8} aria-hidden />
              )
            }
            rightSectionWidth={withSubmit ? 42 : undefined}
            rightSection={
              withSubmit ? (
                <ActionIcon type="submit" variant="filled" color="primaryPink" radius="xl" size={30} aria-label="Search">
                  <IconArrowRight size={16} stroke={2.2} />
                </ActionIcon>
              ) : null
            }
          />
        </Combobox.Target>

        <Combobox.Dropdown hidden={!enabled} className={classes.dropdown}>
          <Combobox.Options aria-label="Product suggestions">
            {items.map((item) => (
              <Combobox.Option key={item.id} value={item.slug} className={classes.option}>
                <SuggestionRow item={item} term={term} />
              </Combobox.Option>
            ))}
            {status ? (
              <Combobox.Empty className={classes.status}>
                {searching ? <Loader size={14} color="primaryPink" aria-hidden /> : null}
                {status}
              </Combobox.Empty>
            ) : null}
          </Combobox.Options>

          {total > 0 ? (
            <Combobox.Footer>
              <UnstyledButton
                className={classes.seeAll}
                onMouseDown={(event) => event.preventDefault()}
                onClick={goToResults}
              >
                {total > items.length ? `See all ${total} results for “${term}”` : `See results for “${term}”`}
                <IconArrowRight size={16} stroke={2} aria-hidden />
              </UnstyledButton>
            </Combobox.Footer>
          ) : null}
        </Combobox.Dropdown>
      </Combobox>

      <VisuallyHidden aria-live="polite">
        {enabled && data && !isFetching ? `${total} ${total === 1 ? "product" : "products"} found` : ""}
      </VisuallyHidden>
    </form>
  );
}
