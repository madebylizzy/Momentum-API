import { errorResponse } from "@/lib/response";

/**
 * Higher-order function wrapping Next.js route handlers.
 * Ensures:
 * 1. Any uncaught exception is logged server-side and mapped to the standard error envelope
 *    with HTTP status 500: {"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."}}
 *    No stack traces or internals are leaked to clients.
 * 2. On GET and HEAD responses under /api/v1, attaches read-only CORS headers:
 *    - Access-Control-Allow-Origin: *
 *    - Access-Control-Expose-Headers: Retry-After
 *    These headers are applied to both success (200) and error responses (400, 404, 429, 500)
 *    so browser consumers can read the API's error and rate-limiting state.
 * 3. Does NOT attach CORS headers on POST, PATCH, or DELETE responses.
 */
export function withErrorHandler<TArgs extends unknown[]>(
  handler: (...args: TArgs) => Promise<Response>
) {
  return async (...args: TArgs): Promise<Response> => {
    const request = args[0] as Request | undefined;
    const method = request?.method?.toUpperCase() ?? "UNKNOWN";
    const isRead = method === "GET" || method === "HEAD";

    try {
      const response = await handler(...args);
      if (isRead) {
        response.headers.set("Access-Control-Allow-Origin", "*");
        response.headers.set("Access-Control-Expose-Headers", "Retry-After");
      }
      return response;
    } catch (error) {
      console.error(
        `[ApiError] Unexpected error in ${method} ${request?.url ?? ""}:`,
        error
      );
      const res = errorResponse(
        "INTERNAL_ERROR",
        "An unexpected error occurred.",
        500
      );
      if (isRead) {
        res.headers.set("Access-Control-Allow-Origin", "*");
        res.headers.set("Access-Control-Expose-Headers", "Retry-After");
      }
      return res;
    }
  };
}

/**
 * Preflight OPTIONS request handler for read-only CORS under /api/v1.
 * Returns HTTP 204 No Content with Access-Control-Allow-Methods: GET, HEAD, OPTIONS.
 */
export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
      "Access-Control-Expose-Headers": "Retry-After",
      "Access-Control-Max-Age": "86400",
    },
  });
}
