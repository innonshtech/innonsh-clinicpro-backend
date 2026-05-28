// Simple in-memory rate limiter for Next.js API routes
const rateLimitMap = new Map();

/**
 * Rate limiter function
 * @param {string} ip - Client IP address
 * @param {Object} options - { limit: number, windowMs: number }
 * @returns {Object} - { success: boolean, remaining: number, reset: number }
 */
export const rateLimit = (ip, options = { limit: 100, windowMs: 15 * 60 * 1000 }) => {
  const now = Date.now();
  const windowStart = now - options.windowMs;
  
  let userRequests = rateLimitMap.get(ip) || [];
  
  // Filter requests within the current window
  userRequests = userRequests.filter(timestamp => timestamp > windowStart);
  
  if (userRequests.length >= options.limit) {
    const oldestRequest = userRequests[0];
    const resetTime = oldestRequest + options.windowMs;
    
    return {
      success: false,
      limit: options.limit,
      remaining: 0,
      reset: resetTime
    };
  }
  
  userRequests.push(now);
  rateLimitMap.set(ip, userRequests);
  
  return {
    success: true,
    limit: options.limit,
    remaining: options.limit - userRequests.length,
    reset: now + options.windowMs
  };
};

// Cleanup stale entries every 15 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, requests] of rateLimitMap.entries()) {
      const activeRequests = requests.filter(ts => ts > now - 60 * 60 * 1000); // Keep 1 hour of history
      if (activeRequests.length === 0) {
        rateLimitMap.delete(ip);
      } else {
        rateLimitMap.set(ip, activeRequests);
      }
    }
  }, 15 * 60 * 1000);
}
