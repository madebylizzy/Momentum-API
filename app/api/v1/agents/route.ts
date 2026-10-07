import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { successCollection, successItem, errorResponse } from "@/lib/response";
import {
  parsePaginationAndSorting,
  formatZodError,
} from "@/lib/validations/common";
import {
  ALLOWED_AGENT_SORT_FIELDS,
  createAgentSchema,
} from "@/lib/validations/agents";
import { Prisma } from "@prisma/client";

export async function GET(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "/api/v1/agents");
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
    ALLOWED_AGENT_SORT_FIELDS,
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
  const where: Prisma.AgentWhereInput = {};

  const city = searchParams.get("city");
  if (city) {
    where.city = { contains: city, mode: "insensitive" };
  }

  const status = searchParams.get("status");
  if (status) {
    where.status = { equals: status.toUpperCase() };
  }

  const [total, agents] = await Promise.all([
    prisma.agent.count({ where }),
    prisma.agent.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { [sort]: order },
    }),
  ]);

  const hasMore = offset + limit < total;

  return successCollection(agents, {
    total,
    limit,
    offset,
    hasMore,
  });
}

export async function POST(request: NextRequest) {
  const rateLimit = await checkRateLimit(request, "/api/v1/agents");
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

  const parseResult = createAgentSchema.safeParse(body);
  if (!parseResult.success) {
    const { message, status, code } = formatZodError(parseResult.error);
    return errorResponse(code, message, status);
  }

  try {
    const createdAgent = await prisma.agent.create({
      data: parseResult.data,
    });
    return successItem(createdAgent, 201);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = (error.meta?.target as string[])?.join(", ") || "field";
      return errorResponse(
        "CONFLICT",
        `An agent with this ${target} already exists`,
        409
      );
    }
    return errorResponse("INTERNAL_ERROR", "Failed to create agent", 500);
  }
}
