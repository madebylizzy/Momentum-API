import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { successItem, errorResponse } from "@/lib/response";
import { validateIdentifier, formatZodError } from "@/lib/validations/common";
import { updateListingSchema } from "@/lib/validations/listings";
import { Prisma } from "@prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/listings/[id]");
  if (!rateLimit.success) {
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please try again later.",
      429,
      { "Retry-After": String(rateLimit.retryAfter ?? 60) }
    );
  }

  const { id } = await context.params;

  const validation = validateIdentifier(id);
  if (!validation.valid) {
    return errorResponse("BAD_REQUEST", validation.error!, 400);
  }

  const listing = await prisma.listing.findUnique({
    where: { id },
    include: {
      agent: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          agencyName: true,
          city: true,
        },
      },
      viewings: {
        take: 10,
        orderBy: { scheduledAt: "asc" },
      },
    },
  });

  if (!listing) {
    return errorResponse("NOT_FOUND", `Listing with ID '${id}' not found`, 404);
  }

  return successItem(listing);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/listings/[id]");
  if (!rateLimit.success) {
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please try again later.",
      429,
      { "Retry-After": String(rateLimit.retryAfter ?? 60) }
    );
  }

  const { id } = await context.params;

  const validation = validateIdentifier(id);
  if (!validation.valid) {
    return errorResponse("BAD_REQUEST", validation.error!, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse("INVALID_JSON", "Invalid JSON in request body", 400);
  }

  const parseResult = updateListingSchema.safeParse(body);
  if (!parseResult.success) {
    const { message, status, code } = formatZodError(parseResult.error);
    return errorResponse(code, message, status);
  }

  try {
    const updatedListing = await prisma.listing.update({
      where: { id },
      data: parseResult.data,
      include: {
        agent: true,
      },
    });
    return successItem(updatedListing);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("NOT_FOUND", `Listing with ID '${id}' not found`, 404);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to update listing", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/listings/[id]");
  if (!rateLimit.success) {
    return errorResponse(
      "RATE_LIMIT_EXCEEDED",
      "Rate limit exceeded. Please try again later.",
      429,
      { "Retry-After": String(rateLimit.retryAfter ?? 60) }
    );
  }

  const { id } = await context.params;

  const validation = validateIdentifier(id);
  if (!validation.valid) {
    return errorResponse("BAD_REQUEST", validation.error!, 400);
  }

  try {
    const deletedListing = await prisma.listing.delete({
      where: { id },
    });
    return successItem({ id: deletedListing.id, deleted: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("NOT_FOUND", `Listing with ID '${id}' not found`, 404);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to delete listing", 500);
  }
}
