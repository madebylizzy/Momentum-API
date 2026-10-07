import { prisma } from "@/lib/prisma";
import { RATE_LIMIT_CONFIG } from "@/lib/config/rate-limit";

export interface RateLimitResult {
  success: boolean;
  retryAfter?: number;
}

/**
 * Extracts client IP from standard proxy headers, falling back to localhost.
 */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "127.0.0.1";
}

/**
 * Checks and increments persistent rate limit in PostgreSQL RateLimitBucket table.
 * Returns { success: true } if allowed, or { success: false, retryAfter: seconds } if exceeded.
 */
export async function checkRateLimit(
  request: Request,
  endpoint: string
): Promise<RateLimitResult> {
  const ip = getClientIp(request);
  const key = `${ip}:${endpoint}`;

  const now = new Date();
  const windowMs = RATE_LIMIT_CONFIG.windowSeconds * 1000;
  const windowThreshold = new Date(now.getTime() - windowMs);

  return await prisma.$transaction(async (tx) => {
    const bucket = await tx.rateLimitBucket.findUnique({
      where: { key },
    });

    // If bucket doesn't exist or previous window expired, reset to 1
    if (!bucket || bucket.windowStart < windowThreshold) {
      await tx.rateLimitBucket.upsert({
        where: { key },
        update: {
          count: 1,
          windowStart: now,
        },
        create: {
          key,
          count: 1,
          windowStart: now,
        },
      });
      return { success: true };
    }

    // If within current window and exceeded max allowed requests
    if (bucket.count >= RATE_LIMIT_CONFIG.maxRequests) {
      const elapsedMs = now.getTime() - bucket.windowStart.getTime();
      const retryAfter = Math.max(1, Math.ceil((windowMs - elapsedMs) / 1000));
      return { success: false, retryAfter };
    }

    // Increment count atomically
    await tx.rateLimitBucket.update({
      where: { key },
      data: {
        count: { increment: 1 },
      },
    });

    return { success: true };
  });
}
