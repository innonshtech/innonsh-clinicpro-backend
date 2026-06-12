import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Session from '@/models/Session';
import { withErrorHandler } from '@/utils/apiHandler';

/**
 * @swagger
 * /api/v1/auth/sessions:
 *   get:
 *     summary: GET all active sessions for the currently authenticated user
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Successful response
 *       401:
 *         description: Unauthorized
 */
export const GET = withErrorHandler(async (req) => {
  await dbConnect();
  
  // The withErrorHandler already extracts user info from middleware headers
  const userId = req.headers.get('x-user-id');
  const userRole = req.headers.get('x-user-role');
  
  if (!userId) {
    return ApiResponse.error("Unauthorized", "UNAUTHORIZED", [], 401);
  }
  
  // If user is admin, they might want to see all sessions? 
  // Let's stick to the current user's sessions to avoid data leaks unless explicitly requested.
  // The requirement: "Session information accessible for security reviews."
  // If the requester is an admin, let them pass an optional ?userId= query param
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('userId');
  
  let query = { isActive: true };
  
  if (userRole === 'admin' && targetUserId) {
    query.userId = targetUserId;
  } else {
    query.userId = userId;
  }

  const activeSessions = await Session.find(query).sort({ lastActivityAt: -1 }).select('-refreshToken -usedRefreshTokens');
  
  return ApiResponse.success({
    count: activeSessions.length,
    sessions: activeSessions
  }, "Active sessions retrieved successfully");
});
