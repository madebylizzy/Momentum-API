import { z } from "zod";

/**
 * Validates a public-facing CUID identifier.
 * Checks for valid format (lowercase/alphanumeric, length 20-36).
 */
export function validateIdentifier(id: string): { valid: boolean; error?: string } {
  if (!id || typeof id !== "string") {
    return { valid: false, error: "Identifier is required" };
  }

  // CUIDs are typically 24-32 characters alphanumeric
  const cuidRegex = /^[a-z0-9_-]{15,36}$/i;
  if (!cuidRegex.test(id)) {
    return { valid: false, error: `Malformed identifier: '${id}' is not a valid format` };
  }

  return { valid: true };
}

/**
 * Helper to extract and format a user-friendly error message from Zod validation.
 * Specifically formats missing required fields with the field name, returning 422.
 */
export function formatZodError(error: z.ZodError): { message: string; status: number; code: string } {
  const firstIssue = error.issues[0];
  const fieldName = firstIssue.path.join(".") || "body";

  // Check if it is a missing required field
  if (
    firstIssue.code === "invalid_type" &&
    (firstIssue as unknown as { received?: string }).received === "undefined"
  ) {
    return {
      message: `Missing required field: ${fieldName}`,
      status: 422,
      code: "UNPROCESSABLE_ENTITY",
    };
  }

  if (firstIssue.code === "custom") {
    return {
      message: firstIssue.message,
      status: 400,
      code: "BAD_REQUEST",
    };
  }

  return {
    message: `Invalid value for '${fieldName}': ${firstIssue.message}`,
    status: 400,
    code: "BAD_REQUEST",
  };
}

export type PaginationResult =
  | { success: true; limit: number; offset: number; sort: string; order: "asc" | "desc" }
  | { success: false; error: { message: string; status: number; code: string } };

/**
 * Parses and validates common pagination and sorting query parameters.
 */
export function parsePaginationAndSorting(
  searchParams: URLSearchParams,
  allowedSortFields: readonly string[],
  defaultSortField = "createdAt",
  defaultOrder: "asc" | "desc" = "desc"
): PaginationResult {
  // 1. Limit: default 20, clamp if > 100, reject if negative or non-numeric
  const rawLimit = searchParams.get("limit");
  let limit = 20;
  if (rawLimit !== null) {
    const parsed = Number(rawLimit);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      return { success: false, error: { message: "Invalid parameter: 'limit' must be an integer", status: 400, code: "BAD_REQUEST" } };
    }
    if (parsed <= 0) {
      return { success: false, error: { message: "Limit must be greater than or equal to 1", status: 400, code: "BAD_REQUEST" } };
    }
    // Clamp to 100, do not reject
    limit = parsed > 100 ? 100 : parsed;
  }

  // 2. Offset: default 0, reject if negative or non-numeric
  const rawOffset = searchParams.get("offset");
  let offset = 0;
  if (rawOffset !== null) {
    const parsed = Number(rawOffset);
    if (isNaN(parsed) || !Number.isInteger(parsed)) {
      return { success: false, error: { message: "Invalid parameter: 'offset' must be an integer", status: 400, code: "BAD_REQUEST" } };
    }
    if (parsed < 0) {
      return { success: false, error: { message: "Offset must be greater than or equal to 0", status: 400, code: "BAD_REQUEST" } };
    }
    offset = parsed;
  }

  // 3. Sort: must be an allowed field, never silently ignored
  const rawSort = searchParams.get("sort");
  let sort = defaultSortField;
  if (rawSort !== null) {
    if (!allowedSortFields.includes(rawSort)) {
      return {
        success: false,
        error: {
          message: `Unknown sort field '${rawSort}'. Allowed fields: ${allowedSortFields.join(", ")}`,
          status: 400,
          code: "BAD_REQUEST",
        },
      };
    }
    sort = rawSort;
  }

  // 4. Order: asc | desc
  const rawOrder = searchParams.get("order");
  let order: "asc" | "desc" = defaultOrder;
  if (rawOrder !== null) {
    const lower = rawOrder.toLowerCase();
    if (lower !== "asc" && lower !== "desc") {
      return {
        success: false,
        error: {
          message: `Invalid order '${rawOrder}'. Order must be 'asc' or 'desc'`,
          status: 400,
          code: "BAD_REQUEST",
        },
      };
    }
    order = lower as "asc" | "desc";
  }

  return { success: true, limit, offset, sort, order };
}
