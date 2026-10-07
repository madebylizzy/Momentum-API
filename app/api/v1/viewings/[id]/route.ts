import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { successItem, errorResponse } from "@/lib/response";
import { validateIdentifier, formatZodError } from "@/lib/validations/common";
import { updateViewingSchema } from "@/lib/validations/viewings";
import { Prisma } from "@prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/viewings/[id]");
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

  const viewing = await prisma.viewing.findUnique({
    where: { id },
    include: {
      listing: {
        include: {
          agent: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
            },
          },
        },
      },
    },
  });

  if (!viewing) {
    return errorResponse("NOT_FOUND", `Viewing with ID '${id}' not found`, 404);
  }

  return successItem(viewing);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/viewings/[id]");
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

  const parseResult = updateViewingSchema.safeParse(body);
  if (!parseResult.success) {
    const { message, status, code } = formatZodError(parseResult.error);
    return errorResponse(code, message, status);
  }

  const updateData: Prisma.ViewingUpdateInput = { ...parseResult.data };
  if (parseResult.data.scheduledAt) {
    updateData.scheduledAt = new Date(parseResult.data.scheduledAt);
  }

  try {
    const updatedViewing = await prisma.viewing.update({
      where: { id },
      data: updateData,
      include: {
        listing: true,
      },
    });
    return successItem(updatedViewing);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("NOT_FOUND", `Viewing with ID '${id}' not found`, 404);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to update viewing", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/viewings/[id]");
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
    const deletedViewing = await prisma.viewing.delete({
      where: { id },
    });
    return successItem({ id: deletedViewing.id, deleted: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("NOT_FOUND", `Viewing with ID '${id}' not found`, 404);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to delete viewing", 500);
  }
}
