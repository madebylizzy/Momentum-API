import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { successItem, errorResponse } from "@/lib/response";
import { validateIdentifier, formatZodError } from "@/lib/validations/common";
import { updateAgentSchema } from "@/lib/validations/agents";
import { Prisma } from "@prisma/client";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/agents/[id]");
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

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      listings: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!agent) {
    return errorResponse("NOT_FOUND", `Agent with ID '${id}' not found`, 404);
  }

  return successItem(agent);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/agents/[id]");
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

  const parseResult = updateAgentSchema.safeParse(body);
  if (!parseResult.success) {
    const { message, status, code } = formatZodError(parseResult.error);
    return errorResponse(code, message, status);
  }

  try {
    const updatedAgent = await prisma.agent.update({
      where: { id },
      data: parseResult.data,
    });
    return successItem(updatedAgent);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("NOT_FOUND", `Agent with ID '${id}' not found`, 404);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to update agent", 500);
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const rateLimit = await checkRateLimit(request, "/api/v1/agents/[id]");
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
    const deletedAgent = await prisma.agent.delete({
      where: { id },
    });
    return successItem({ id: deletedAgent.id, deleted: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      return errorResponse("NOT_FOUND", `Agent with ID '${id}' not found`, 404);
    }
    return errorResponse("INTERNAL_ERROR", "Failed to delete agent", 500);
  }
}
