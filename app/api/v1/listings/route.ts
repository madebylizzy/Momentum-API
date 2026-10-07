import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { successCollection, successItem, errorResponse } from "@/lib/response";
import {
  parsePaginationAndSorting,
  formatZodError,
} from "@/lib/validations/common";
import {
  ALLOWED_LISTING_SORT_FIELDS,
  createListingSchema,
} from "@/lib/validations/listings";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "/api/v1/listings");
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
    ALLOWED_LISTING_SORT_FIELDS,
    "createdAt",
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
  const where: Prisma.ListingWhereInput = {};

  const city = searchParams.get("city");
  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  const propertyType = searchParams.get("propertyType");
  if (propertyType) {
    where.propertyType = { equals: propertyType.toUpperCase() };
  }

  const status = searchParams.get("status");
  if (status) {
    where.status = { equals: status.toUpperCase() };
  }

  const agentId = searchParams.get("agentId");
  if (agentId) {
    where.agentId = { equals: agentId };
  }

  // Price range filters (in cents)
  const rawMinPrice = searchParams.get("minPrice");
  if (rawMinPrice !== null) {
    const minPrice = Number(rawMinPrice);
    if (isNaN(minPrice) || minPrice < 0) {
      return errorResponse("BAD_REQUEST", "minPrice must be a non-negative number", 400);
    }
    where.price = { ...(where.price as Prisma.IntFilter), gte: minPrice };
  }

  const rawMaxPrice = searchParams.get("maxPrice");
  if (rawMaxPrice !== null) {
    const maxPrice = Number(rawMaxPrice);
    if (isNaN(maxPrice) || maxPrice < 0) {
      return errorResponse("BAD_REQUEST", "maxPrice must be a non-negative number", 400);
    }
    where.price = { ...(where.price as Prisma.IntFilter), lte: maxPrice };
  }

  const [total, listings] = await Promise.all([
    prisma.listing.count({ where }),
    prisma.listing.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { [sort]: order },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            agencyName: true,
          },
        },
      },
    }),
  ]);

  const hasMore = offset + limit < total;

  return successCollection(listings, {
    total,
    limit,
    offset,
    hasMore,
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "/api/v1/listings");
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

  const parseResult = createListingSchema.safeParse(body);
  if (!parseResult.success) {
    const { message, status, code } = formatZodError(parseResult.error);
    return errorResponse(code, message, status);
  }

  const data = parseResult.data;

  // Verify that the referenced agent exists
  const agentExists = await prisma.agent.findUnique({
    where: { id: data.agentId },
    select: { id: true },
  });

  if (!agentExists) {
    return errorResponse(
      "UNPROCESSABLE_ENTITY",
      `Referenced agent with ID '${data.agentId}' does not exist`,
      422
    );
  }

  try {
    const createdListing = await prisma.listing.create({
      data,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            agencyName: true,
          },
        },
      },
    });
    return successItem(createdListing, 201);
  } catch {
    return errorResponse("INTERNAL_ERROR", "Failed to create listing", 500);
  }
}
