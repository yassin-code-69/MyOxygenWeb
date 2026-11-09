"use client";

import { useCallback, useRef, useState } from "react";
import { notifications } from "@mantine/notifications";
import { fetchAllProfitProducts } from "../../../../hooks/admin/use-reports";
import { getErrorMessage } from "../../../../lib/api-client";
import { downloadCsv, toCsv, type CsvColumn } from "../../../../lib/csv";
import type { ProfitProductRow, ProfitProductSort } from "../../../../types/admin-reports";
import { formatCount } from "../../format";
import { rangeFileSuffix } from "../report-utils";

export interface ProfitExportFilter {
  from: string;
  to: string;
  q: string;
  categoryId: string | null;
  sort: ProfitProductSort;
}

const MAX_EXPORT_ROWS = 5000;

const CSV_COLUMNS: readonly CsvColumn<ProfitProductRow>[] = [
  { header: "Product", value: (row) => row.title },
  { header: "SKU", value: (row) => row.sku },
  { header: "Category", value: (row) => row.category?.name ?? "" },
  { header: "Status", value: (row) => (row.isActive ? "Active" : "Inactive") },
  { header: "Units sold", value: (row) => row.unitsSold },
  { header: "Revenue (BDT)", value: (row) => row.revenue },
  { header: "Cost of goods (BDT)", value: (row) => row.cogs },
  { header: "Gross profit (BDT)", value: (row) => row.profit },
  { header: "Avg selling price (BDT)", value: (row) => row.sellingPrice },
  { header: "Avg cost (BDT)", value: (row) => row.avgCost },
  { header: "Profit per unit (BDT)", value: (row) => row.profitPerUnit },
  { header: "Margin (%)", value: (row) => row.marginPercent },
];

/**
 * "Export CSV" / "Generate Report": every product-profitability row matching
 * the filter (pages fetched one by one, capped at 5,000), saved as CSV.
 */
export function useProfitExport(filter: ProfitExportFilter) {
  const [exporting, setExporting] = useState(false);
  const running = useRef(false);

  const exportCsv = useCallback(async () => {
    if (running.current) {
      return;
    }
    running.current = true;
    setExporting(true);
    try {
      const result = await fetchAllProfitProducts(
        { from: filter.from, to: filter.to, q: filter.q, categoryId: filter.categoryId, sort: filter.sort },
        { maxRows: MAX_EXPORT_ROWS },
      );
      if (result.items.length === 0) {
        notifications.show({ color: "warning", title: "Nothing to export", message: "No products match these filters." });
        return;
      }
      downloadCsv(`profit-by-product_${rangeFileSuffix(filter)}.csv`, toCsv(result.items, CSV_COLUMNS));
      notifications.show({
        color: result.truncated ? "warning" : "success",
        title: result.truncated ? "Export capped" : "Report exported",
        message: result.truncated
          ? `Saved the first ${formatCount(result.items.length)} of ${formatCount(result.total)} products. Narrow the filters to export the rest.`
          : `Saved ${formatCount(result.items.length)} products to CSV.`,
      });
    } catch (error) {
      notifications.show({ color: "danger", title: "Export failed", message: getErrorMessage(error) });
    } finally {
      running.current = false;
      setExporting(false);
    }
  }, [filter]);

  return { exporting, exportCsv };
}
