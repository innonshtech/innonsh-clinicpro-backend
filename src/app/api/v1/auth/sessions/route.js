import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
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
 *       500:
 *         description: Internal Server Error
 */
export const GET = withErrorHandler(async (req) => {
  // The withErrorHandler already extracts user info from middleware headers
  const userId = req.headers.get('x-user-id');
  const userRole = req.headers.get('x-user-role');
  
  if (!userId) {
    return ApiResponse.error("Unauthorized", "UNAUTHORIZED", [], 401);
  }
  
  const url = new URL(req.url);
  const targetUserId = url.searchParams.get('userId');
  
  let queryUserId = userId;
  
  if (userRole === 'admin' && targetUserId) {
    queryUserId = targetUserId;
  }

  const { data: activeSessions, error } = await supabase
    .from('sessions')
    .select('id, user_id, device_info, ip_address, is_active, created_at, expires_at, last_activity_at')
    .eq('is_active', true)
    .eq('user_id', queryUserId)
    .order('last_activity_at', { ascending: false });
    
  if (error) throw error;
  
  // Map back for frontend
  const mappedSessions = (activeSessions || []).map(s => ({
    _id: s.id,
    userId: s.user_id,
    deviceInfo: s.device_info,
    ipAddress: s.ip_address,
    isActive: s.is_active,
    createdAt: s.created_at,
    expiresAt: s.expires_at,
    lastActivityAt: s.last_activity_at
  }));
  
  return ApiResponse.success({
    count: mappedSessions.length,
    sessions: mappedSessions
  }, "Active sessions retrieved successfully");
});
