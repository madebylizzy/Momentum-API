import crypto from "crypto";
import { errorResponse } from "@/lib/response";
import { NextResponse } from "next/server";

/**
 * Validates write operations against the configured API_WRITE_KEY.
 *
 * Rules:
 * 1. If API_WRITE_KEY is not set in the environment, rejects with 503 and logs server-side (fails closed).
 * 2. Compares x-api-key header using crypto.timingSafeEqual (checking buffer lengths first).
 * 3. Never logs or echoes the key or header value.
 * 4. Returns 401 with standard error envelope if missing or incorrect.
 * 5. Returns null if authorized.
 */
export function verifyWriteAuth(request: Request): NextResponse | null {
  const expectedKey = process.env.API_WRITE_KEY;
  if (!expectedKey) {
    console.error(
      "[Auth] API_WRITE_KEY is not configured in environment; rejecting write operation (fail-closed)."
    );
    return errorResponse(
      "SERVICE_UNAVAILABLE",
      "Write operations are temporarily unavailable.",
      503
    );
  }

  const providedKey = request.headers.get("x-api-key");
  if (!providedKey) {
    return errorResponse(
      "UNAUTHORIZED",
      "A valid API key is required for write operations.",
      401
    );
  }

  const expectedBuffer = Buffer.from(expectedKey, "utf-8");
  const providedBuffer = Buffer.from(providedKey, "utf-8");

  if (
    expectedBuffer.length !== providedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, providedBuffer)
  ) {
    return errorResponse(
      "UNAUTHORIZED",
      "A valid API key is required for write operations.",
      401
    );
  }

  return null;
}
