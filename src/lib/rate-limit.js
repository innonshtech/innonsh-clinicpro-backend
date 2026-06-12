import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

// Only initialize if credentials are provided
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// Create dummy limiter that always allows requests if Redis is not configured
const createDummyLimiter = () => ({
  limit: async () => ({ success: true, limit: 100, remaining: 99, reset: Date.now() + 60000 })
});

// 1. Login APIs (Strict: 5 requests per minute)
export const loginLimiter = redis 
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(5, "1 m"), analytics: true })
  : createDummyLimiter();

// 2. Password Reset APIs (Strict: 3 requests per 15 minutes)
export const passwordResetLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "15 m"), analytics: true })
  : createDummyLimiter();

// 3. OTP APIs (Strict: 3 requests per 5 minutes)
export const otpLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(3, "5 m"), analytics: true })
  : createDummyLimiter();

// 4. File Upload APIs (Moderate: 10 requests per hour)
export const uploadLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, "1 h"), analytics: true })
  : createDummyLimiter();

// 5. Public APIs (Permissive: 100 requests per minute)
export const publicApiLimiter = redis
  ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(100, "1 m"), analytics: true })
  : createDummyLimiter();

/**
 * Helper to get the client IP from a Next.js request.
 */
export function getIP(request) {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  const xRealIp = request.headers.get("x-real-ip");
  return xForwardedFor ? xForwardedFor.split(",")[0] : (xRealIp || "127.0.0.1");
}

/**
 * Standard rate limit response headers.
 */
export function getRateLimitHeaders(result) {
  return {
    "X-RateLimit-Limit": result.limit.toString(),
    "X-RateLimit-Remaining": result.remaining.toString(),
    "X-RateLimit-Reset": result.reset.toString(),
    "Retry-After": Math.ceil((result.reset - Date.now()) / 1000).toString(),
  };
}
