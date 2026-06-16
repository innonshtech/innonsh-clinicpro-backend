import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import jwt from 'jsonwebtoken';
import { supabase } from '@/lib/supabase';
import { ROLES } from '@/constants/roles';
import { generateToken } from '@/utils/generateToken';

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

export async function POST(req) {
  try {
    // Get refresh token from cookies
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) {
      return ApiResponse.error("No cookies found", "NO_COOKIES", [], 401);
    }
    
    // Simple cookie parser
    const cookies = Object.fromEntries(
      cookieHeader.split('; ').map(c => {
        const parts = c.split('=');
        return [parts[0], decodeURIComponent(parts.slice(1).join('='))];
      })
    );
    
    const refreshToken = cookies['refreshToken'];
    
    if (!refreshToken) {
      return ApiResponse.error("Refresh token not found", "UNAUTHORIZED", [], 401);
    }
    
    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    } catch (error) {
      return ApiResponse.error("Invalid or expired refresh token", "INVALID_TOKEN", [], 401);
    }
    
    // Check if session exists in DB (either active token or used token)
    const { data: sessionMatches, error: sessionErr } = await supabase
      .from('sessions')
      .select('*')
      .or(`refresh_token.eq.${refreshToken},used_refresh_tokens.cs.{${refreshToken}}`);

    if (sessionErr) throw sessionErr;

    const session = sessionMatches && sessionMatches.length > 0 ? sessionMatches[0] : null;

    if (!session) {
      return ApiResponse.error("Session not found", "SESSION_NOT_FOUND", [], 401);
    }

    // Token reuse detection: if the presented token is in the used list
    if (session.used_refresh_tokens && session.used_refresh_tokens.includes(refreshToken)) {
      // The session is compromised. Revoke it immediately.
      await supabase
        .from('sessions')
        .update({ is_active: false })
        .eq('id', session.id);
      return ApiResponse.error("Token reuse detected, session revoked", "SESSION_REVOKED", [], 401);
    }

    // If the token is the current active token but the session is inactive
    if (!session.is_active) {
      return ApiResponse.error("Session revoked", "SESSION_REVOKED", [], 401);
    }
    
    // Fetch user depending on role
    let user;
    const role = decoded.role;
    let table = null;
    
    if (role === ROLES.ADMIN) table = 'admins';
    else if (role === ROLES.CLINIC) table = 'clinics';
    else if (role === ROLES.DOCTOR) table = 'doctors';
    else if (role === ROLES.PATIENT) table = 'patients';
    else if (role === ROLES.RECEPTIONIST) table = 'staff';
    
    if (table) {
      const { data: userData, error: userErr } = await supabase
        .from(table)
        .select('*')
        .eq('id', decoded.id)
        .maybeSingle();
      if (!userErr && userData) {
        user = { ...userData, _id: userData.id };
      }
    }
    
    if (!user) {
      return ApiResponse.error("User not found", "USER_NOT_FOUND", [], 404);
    }
    
    // Generate new tokens (rotation)
    const tokens = generateToken(user, role, decoded.clinicId);
    
    // Move the current token to the used list
    const usedRefreshTokens = session.used_refresh_tokens || [];
    usedRefreshTokens.push(session.refresh_token);

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const lastActivityAt = new Date().toISOString();

    // Update session with new refresh token
    const { error: updateErr } = await supabase
      .from('sessions')
      .update({
        refresh_token: tokens.refreshToken,
        used_refresh_tokens: usedRefreshTokens,
        expires_at: expiresAt,
        last_activity_at: lastActivityAt
      })
      .eq('id', session.id);

    if (updateErr) throw updateErr;
    
    const response = ApiResponse.success({
      token: tokens.accessToken
    }, "Token refreshed");
    
    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });
    
    return response;
    
  } catch (error) {
    console.error("Refresh token error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
