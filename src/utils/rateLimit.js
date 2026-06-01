import RateLimit from '@/models/RateLimit';
import dbConnect from '@/utils/db';

/**
 * DB-backed Rate limiter function
 * @param {string} ip - Client IP address
 * @param {Object} options - { limit: number, windowMs: number, endpoint: string }
 * @returns {Promise<Object>} - { success: boolean, remaining: number, reset: number }
 */
export const rateLimit = async (ip, options = { limit: 100, windowMs: 15 * 60 * 1000, endpoint: 'global' }) => {
  await dbConnect();
  
  const now = new Date();
  
  // Find or create the rate limit document
  let record = await RateLimit.findOne({ ip, endpoint: options.endpoint });
  
  if (!record) {
    record = new RateLimit({
      ip,
      endpoint: options.endpoint,
      hits: 1,
      expiresAt: new Date(now.getTime() + options.windowMs)
    });
    await record.save();
    return {
      success: true,
      limit: options.limit,
      remaining: options.limit - 1,
      reset: record.expiresAt.getTime()
    };
  }

  // If expired, reset it (though MongoDB TTL should handle this eventually)
  if (now > record.expiresAt) {
    record.hits = 1;
    record.expiresAt = new Date(now.getTime() + options.windowMs);
    await record.save();
    return {
      success: true,
      limit: options.limit,
      remaining: options.limit - 1,
      reset: record.expiresAt.getTime()
    };
  }

  // Increment hits
  record.hits += 1;
  await record.save();

  if (record.hits > options.limit) {
    return {
      success: false,
      limit: options.limit,
      remaining: 0,
      reset: record.expiresAt.getTime()
    };
  }

  return {
    success: true,
    limit: options.limit,
    remaining: options.limit - record.hits,
    reset: record.expiresAt.getTime()
  };
};
