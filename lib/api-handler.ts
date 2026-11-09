import { errorResponse } from "@/lib/response";

/**
 * Higher-order function wrapping Next.js route handlers.
 * Ensures any uncaught exception is logged server-side and mapped to the standard error envelope
 * with HTTP status 500: {"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."}}
 * No stack traces or internals are leaked to clients.
 */
export function withErrorHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
) {
  return async (...args: TArgs): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      const request = args[0] as Request | undefined;
      console.error(
        `[ApiError] Unexpected error in ${request?.method ?? "UNKNOWN"} ${request?.url ?? ""}:`,
        error
      );
      return errorResponse(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        500
      );
    }
  };
}
