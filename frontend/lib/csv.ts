/**
 * CSV export helpers (RFC 4180).
 *
 *   const rows = await collectPages((page) => api.getPage("/admin/inventory/ledger", { ...filters, page, limit: 100 }));
 *   downloadCsv("stock-ledger.csv", toCsv(rows.items, columns));
 *
 * - Fields containing a comma, quote, CR or LF are quoted; quotes are doubled.
 * - Cells that start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'`
 *   so spreadsheet apps never evaluate them as formulas (CSV injection).
 *   Plain negative numbers (e.g. `-3`) are left untouched.
 * - Lines end with CRLF; the download starts with a UTF-8 BOM so Excel shows
 *   `৳` and Bangla text correctly.
 */
import type { PaginationMeta } from "../types/api";

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

const UTF8_BOM = "﻿";
const NUMERIC = /^-?\d+(\.\d+)?$/;
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/** Escapes one CSV field. */
export function escapeCsvCell(value: CsvValue): string {
  if (value === null || value === undefined) {
    return "";
  }
  let text = typeof value === "string" ? value : String(value);
  if (typeof value === "string" && FORMULA_TRIGGER.test(text) && !NUMERIC.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

/** Serialises rows into a CSV document (header row + CRLF line endings). */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const lines = [columns.map((column) => escapeCsvCell(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvCell(column.value(row))).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Saves a CSV string as a file (UTF-8 with BOM). Browser only. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([UTF8_BOM, csv], { type: "text/csv;charset=utf-8" });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can abort the download in Safari / older Firefox.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

export interface CollectPagesOptions {
  /** Hard cap on collected rows (default 5,000). */
  maxRows?: number;
  /** Called after every page with the running count. */
  onProgress?: (collected: number, total: number) => void;
  signal?: AbortSignal;
}

export interface CollectedPages<T> {
  items: T[];
  /** Total rows matching the filter on the server. */
  total: number;
  /** True when `total` exceeded `maxRows` and the export was cut off. */
  truncated: boolean;
}

/**
 * Fetches pages sequentially (page 1, 2, …) until every row is collected or
 * `maxRows` is reached. Sequential on purpose: it keeps the API load flat.
 */
export async function collectPages<T>(
  fetchPage: (page: number) => Promise<{ items: T[]; meta: PaginationMeta }>,
  { maxRows = 5000, onProgress, signal }: CollectPagesOptions = {},
): Promise<CollectedPages<T>> {
  const items: T[] = [];
  let page = 1;
  let total = 0;
  let totalPages = 1;

  do {
    if (signal?.aborted) {
      throw new DOMException("Export cancelled", "AbortError");
    }
    const result = await fetchPage(page);
    total = result.meta.total;
    totalPages = result.meta.totalPages;
    items.push(...result.items);
    onProgress?.(Math.min(items.length, maxRows), Math.min(total, maxRows));
    page += 1;
  } while (page <= totalPages && items.length < maxRows);

  return { items: items.slice(0, maxRows), total, truncated: total > maxRows };
}
