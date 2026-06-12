import { ApiResponse } from '@/utils/apiResponse';
import { sanitizeData } from '@/utils/sanitizer';
import logger from '@/utils/logger';
import { requestContext } from '@/utils/asyncContext';

/**
 * Higher Order Function that wraps a Next.js App Router API route handler.
 * Provides a standardized try/catch block to catch any unhandled exceptions and format
 * them uniformly as HTTP 500 or appropriate status codes without leaking stack traces.
 * 
 * @param {Function} handler The route handler function (e.g., async (req, ctx) => {})
 * @returns {Function} wrapped handler
 */
export function withErrorHandler(handler) {
  return async (req, context) => {
    try {
      // Monkey-patch req.json to intercept and sanitize request bodies globally
      if (typeof req.json === 'function') {
        const originalJson = req.json.bind(req);
        req.json = async () => {
          const rawData = await originalJson();
          return sanitizeData(rawData);
        };
      }

      const state = {
        userId: req.headers.get('x-user-id'),
        userRole: req.headers.get('x-user-role'),
        ipAddress: req.headers.get('x-forwarded-for') || '127.0.0.1',
        method: req.method,
        url: req.url,
      };

      return await requestContext.run(state, async () => {
        return await handler(req, context);
      });
    } catch (error) {
      logger.error(`[API ERROR] ${req.method} ${req.url} ->`, { message: error.message, stack: error.stack });

      // Handle Zod validation errors globally if we ever throw them
      if (error.name === 'ZodError') {
        return ApiResponse.error(
          'Validation failed',
          'VALIDATION_ERROR',
          error.format(),
          400
        );
      }

      // Handle MongoDB/Mongoose specific errors
      if (error.name === 'ValidationError') {
        return ApiResponse.error(
          'Database validation failed',
          'DB_VALIDATION_ERROR',
          error.message,
          400
        );
      }

      if (error.code === 11000) {
        return ApiResponse.error(
          'Duplicate Entry Detected',
          'DUPLICATE_ENTRY',
          error.keyValue,
          409
        );
      }

      const isDev = process.env.NODE_ENV === 'development';
      
      return ApiResponse.error(
        isDev ? `Server Error: ${error.message}` : 'Internal Server Error',
        'SERVER_ERROR',
        isDev ? error.stack : [],
        500
      );
    }
  };
}
