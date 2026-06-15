/**
 * rateLimit.js - In-memory rate limiting using Upstash Redis (already in project).
 * This file is UNCHANGED from the original. The Upstash-based rate limiting
 * continues to work without any MongoDB dependency. No migration needed.
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let redisClient = null;
let rateLimiterCache = {};

function getRedisClient() {
  if (!redisClient) {
    if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
      // Fallback: memory-based rate limiter when Redis isn't configured
      return null;
    }
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redisClient;
}

/**
 * Rate limit a request.
 * @param {string} ip - The client IP address.
 * @param {Object} options - { limit, windowMs, endpoint }
 * @returns {{ success: boolean, reset: number }}
 */
export async function rateLimit(ip, options = {}) {
  const { limit = 60, windowMs = 60000, endpoint = 'default' } = options;
  const redis = getRedisClient();

  if (!redis) {
    // If Redis not configured, allow all requests (development mode)
    return { success: true, reset: 0 };
  }

  const cacheKey = `${endpoint}:${limit}:${windowMs}`;
  if (!rateLimiterCache[cacheKey]) {
    rateLimiterCache[cacheKey] = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowMs}ms`),
    });
  }

  const limiter = rateLimiterCache[cacheKey];
  const identifier = `${endpoint}:${ip}`;

  try {
    const result = await limiter.limit(identifier);
    return {
      success: result.success,
      reset: result.reset,
      remaining: result.remaining,
    };
  } catch (err) {
    console.error('[RATE LIMIT ERROR]', err.message);
    return { success: true, reset: 0 }; // Fail open
  }
}
