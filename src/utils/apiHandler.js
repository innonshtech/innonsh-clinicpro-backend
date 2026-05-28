import { ApiResponse } from '@/utils/apiResponse';

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
      return await handler(req, context);
    } catch (error) {
      console.error(`[API ERROR] ${req.method} ${req.url} ->`, error);

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
