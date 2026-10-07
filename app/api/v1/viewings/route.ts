import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { successCollection, successItem, errorResponse } from "@/lib/response";
import {
  parsePaginationAndSorting,
  formatZodError,
} from "@/lib/validations/common";
import {
  ALLOWED_VIEWING_SORT_FIELDS,
  createViewingSchema,
} from "@/lib/validations/viewings";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "/api/v1/viewings");
  if (!rateLimit.success) {
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please try again later.",
      429,
      { "Retry-After": String(rateLimit.retryAfter ?? 60) }
    );
  }

  const { searchParams } = new URL(request.url);

  // Parse pagination and sorting
  const paginationResult = parsePaginationAndSorting(
    searchParams,
    ALLOWED_VIEWING_SORT_FIELDS,
    "scheduledAt",
    "desc"
  );

  if (!paginationResult.success) {
    return errorResponse(
      paginationResult.error.code,
      paginationResult.error.message,
      paginationResult.error.status
    );
  }

  const { limit, offset, sort, order } = paginationResult;

  // Build filters
  const where: Prisma.ViewingWhereInput = {};

  const status = searchParams.get("status");
  if (status) {
    where.status = { equals: status.toUpperCase() };
  }

  const listingId = searchParams.get("listingId");
  if (listingId) {
    where.listingId = { equals: listingId };
  }

  const [total, viewings] = await Promise.all([
    prisma.viewing.count({ where }),
    prisma.viewing.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { [sort]: order },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
            price: true,
          },
        },
      },
    }),
  ]);

  const hasMore = offset + limit < total;

  return successCollection(viewings, {
    total,
    limit,
    offset,
    hasMore,
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "/api/v1/viewings");
  if (!rateLimit.success) {
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please try again later.",
      429,
      { "Retry-After": String(rateLimit.retryAfter ?? 60) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON in request body", 400);
  }

  const parseResult = createViewingSchema.safeParse(body);
  if (!parseResult.success) {
    const { message, status, code } = formatZodError(parseResult.error);
    return errorResponse(code, message, status);
  }

  const data = parseResult.data;

  // Verify that referenced listing exists
  const listingExists = await prisma.listing.findUnique({
    where: { id: data.listingId },
    select: { id: true },
  });

  if (!listingExists) {
    return errorResponse(
      "UNPROCESSABLE_ENTITY",
      `Referenced listing with ID '${data.listingId}' does not exist`,
      422
    );
  }

  try {
    const createdViewing = await prisma.viewing.create({
      data: {
        listingId: data.listingId,
        viewerName: data.viewerName,
        viewerEmail: data.viewerEmail,
        viewerPhone: data.viewerPhone,
        scheduledAt: new Date(data.scheduledAt),
        status: data.status,
        notes: data.notes,
      },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            address: true,
            city: true,
          },
        },
      },
    });
    return successItem(createdViewing, 201);
  } catch {
    return errorResponse("INTERNAL_ERROR", "Failed to create viewing", 500);
  }
}
