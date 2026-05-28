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
   * @param {string} code - Specific error code (e.g. 'AUTH_FAILED')
   * @param {any} details - Additional error details
   * @param {number} status - HTTP status code
   */
  error: (message = 'Error', code = 'INTERNAL_ERROR', details = [], status = 500) => {
    return NextResponse.json({
      success: false,
      message,
      data: null,
      error: {
        code,
        details
      }
    }, { status });
  }
};
