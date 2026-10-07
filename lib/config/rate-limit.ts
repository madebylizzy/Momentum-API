/**
 * Rate Limiting Configuration
 *
 * This configuration centralizes rate limiting parameters so they are not hardcoded
 * inline in route handlers. It defines the default sliding/fixed window length and maximum
 * permitted requests per IP + endpoint before triggering a 429 response.
 */

export const RATE_LIMIT_CONFIG = {
  // Window length in seconds (e.g. 60 seconds = 1 minute)
  windowSeconds: 60,

  // Maximum allowed requests per IP + endpoint within the window duration
  maxRequests: 60,
};
