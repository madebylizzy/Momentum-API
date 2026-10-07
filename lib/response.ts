import { NextResponse } from "next/server";

export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface SuccessCollectionEnvelope<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SuccessItemEnvelope<T> {
  data: T;
}

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
}

/**
 * Returns a collection response using the locked envelope shape:
 * { "data": [...], "meta": { "total": ..., "limit": ..., "offset": ..., "hasMore": ... } }
 */
export function successCollection<T>(
  data: T[],
  meta: PaginationMeta,
  status = 200,
  headers?: Record<string, string>
) {
  const body: SuccessCollectionEnvelope<T> = { data, meta };
  return NextResponse.json(body, { status, headers });
}

/**
 * Returns a single-item response using the locked envelope shape:
 * { "data": { ... } }
 */
export function successItem<T>(
  data: T,
  status = 200,
  headers?: Record<string, string>
) {
  const body: SuccessItemEnvelope<T> = { data };
  return NextResponse.json(body, { status, headers });
}

/**
 * Returns an error response using the locked envelope shape:
 * { "error": { "code": "...", "message": "..." } }
 */
export function errorResponse(
  code: string,
  message: string,
  status: number,
  headers?: Record<string, string>
) {
  const body: ErrorEnvelope = {
    error: {
      code,
      message,
    },
  };
  return NextResponse.json(body, { status, headers });
}
