import { isApiError } from "../../lib/api-client";

/** Minimal surface of a `@mantine/form` instance used to show server errors. */
export interface FieldErrorTarget {
  setFieldError: (path: string, error: string) => void;
}

function readConflictField(details: unknown): string | null {
  if (typeof details === "object" && details !== null && "field" in details && typeof details.field === "string") {
    return details.field;
  }
  return null;
}

/**
 * Maps API errors onto form fields:
 * - 422 VALIDATION_ERROR → every `fieldErrors` entry whose key is a known field;
 * - 409 CONFLICT with `details.field` (duplicate slug / sku / code) → that field.
 *
 * Returns true when at least one field received an error; otherwise the
 * caller shows the message in a form-level alert.
 */
export function applyApiFieldErrors(
  form: FieldErrorTarget,
  error: unknown,
  knownFields: readonly string[],
  aliases: Readonly<Record<string, string>> = {},
): boolean {
  if (!isApiError(error)) {
    return false;
  }
  let mapped = false;
  const target = (field: string): string | null => {
    const name = aliases[field] ?? field;
    return knownFields.includes(name) ? name : null;
  };

  if (error.code === "VALIDATION_ERROR") {
    for (const [field, messages] of Object.entries(error.fieldErrors)) {
      const name = target(field);
      if (name && messages.length > 0) {
        form.setFieldError(name, messages.join(" "));
        mapped = true;
      }
    }
  }
  if (error.code === "CONFLICT") {
    const field = readConflictField(error.details);
    const name = field ? target(field) : null;
    if (name) {
      form.setFieldError(name, error.message);
      mapped = true;
    }
  }
  return mapped;
}
