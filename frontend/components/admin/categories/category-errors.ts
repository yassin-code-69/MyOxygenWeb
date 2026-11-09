import { isApiError } from "../../../lib/api-client";

/**
 * `details.listedProductCount` of the 409 raised when deactivating a category
 * that still has ACTIVE or AWAITING_STOCK products; `null` for any other error.
 */
export function readListedProductCount(error: unknown): number | null {
  if (!isApiError(error) || error.status !== 409) {
    return null;
  }
  const details = error.details;
  if (typeof details === "object" && details !== null && "listedProductCount" in details) {
    const value = details.listedProductCount;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  }
  return null;
}
