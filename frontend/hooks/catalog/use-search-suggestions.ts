"use client";

import useSWR from "swr";
import { useDebouncedValue } from "@mantine/hooks";
import { api, type ApiError } from "../../lib/api-client";
import type { ProductSuggestionsDTO } from "../../types/catalog";

const SUGGESTIONS_PATH = "/catalog/search/suggestions";
/** The API rejects shorter terms; one letter matches too much to be useful. */
export const SUGGESTIONS_MIN_LENGTH = 2;
/** Rows in the dropdown (the API allows up to 10). */
export const SUGGESTIONS_LIMIT = 6;
/** Wait for a pause in typing before asking the API. */
const DEBOUNCE_MS = 250;

/** Trims, collapses inner whitespace and caps at the API's 100 characters. */
export function normalizeSearchTerm(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 100);
}

type SuggestionsKey = readonly [path: string, q: string];

/**
 * `GET /catalog/search/suggestions` for search as you type.
 *
 * Requests start after a 250 ms pause and only for terms of 2+ characters.
 * The key is lower-cased (search is case-insensitive) so "Lotion" and
 * "lotion" share one cached result. The previous result stays on screen
 * while the next one loads, so the list does not flicker on every keystroke.
 */
export function useSearchSuggestions(query: string) {
  const term = normalizeSearchTerm(query);
  const [debouncedTerm] = useDebouncedValue(term, DEBOUNCE_MS);
  const active = debouncedTerm.length >= SUGGESTIONS_MIN_LENGTH && term.length >= SUGGESTIONS_MIN_LENGTH;

  const { data, error, isLoading, isValidating } = useSWR<ProductSuggestionsDTO, ApiError, SuggestionsKey | null>(
    active ? [SUGGESTIONS_PATH, debouncedTerm.toLowerCase()] : null,
    ([path, q]) => api.get<ProductSuggestionsDTO>(path, { q, limit: SUGGESTIONS_LIMIT }),
    { keepPreviousData: true, revalidateOnFocus: false, dedupingInterval: 30_000, shouldRetryOnError: false }
  );

  const enabled = term.length >= SUGGESTIONS_MIN_LENGTH;
  return {
    /** What the user typed, normalized (used for highlighting and "See all"). */
    term,
    /** True when the dropdown has something to show for the current input. */
    enabled,
    data: enabled ? data : undefined,
    error: enabled && active ? error : undefined,
    /** Waiting for the debounce or the network. */
    isFetching: enabled && (term !== debouncedTerm || isLoading || isValidating),
  };
}
