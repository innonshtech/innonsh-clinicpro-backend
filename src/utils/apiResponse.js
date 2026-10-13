import { NextResponse } from 'next/server';

/**
 * Standard API Response Utility
 */
export const ApiResponse = {
  /**
   * Success Response
   * @param {any} data - The data to return
   * @param {string} message - Success message
   * @param {number} status - HTTP status code
   */
  success: (data, message = 'Success', status = 200) => {
    return NextResponse.json({
      success: true,
      message,
      data,
      error: null
    }, { status });
  },

  /**
   * Error Response
   * @param {string} message - Error message
   * @param {string|number} code - Specific error code (e.g. 'AUTH_FAILED') or HTTP status code
   * @param {any} details - Additional error details
   * @param {number} status - HTTP status code
   */
  error: (message = 'Error', code = 'INTERNAL_ERROR', details = [], status = 500) => {
    let effectiveStatus = status;
    let effectiveCode = code;

    // Handle case where status code is passed as second argument: ApiResponse.error('msg', 403)
    if (typeof code === 'number') {
      effectiveStatus = code;
      effectiveCode =
        effectiveStatus === 401 ? 'UNAUTHORIZED' :
        effectiveStatus === 403 ? 'FORBIDDEN' :
        effectiveStatus === 404 ? 'NOT_FOUND' :
        effectiveStatus === 400 ? 'BAD_REQUEST' :
        effectiveStatus === 409 ? 'CONFLICT' : 'INTERNAL_ERROR';
    }

    return NextResponse.json({
      success: false,
      message,
      data: null,
      error: {
        code: effectiveCode,
        details: Array.isArray(details) ? details : []
      }
    }, { status: effectiveStatus });
  }
};
