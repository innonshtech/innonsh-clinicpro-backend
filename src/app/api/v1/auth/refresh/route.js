import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import jwt from 'jsonwebtoken';
import dbConnect from '@/utils/db';
import Session from '@/models/Session';
import Admin from '@/models/Admin';
import Clinic from '@/models/Clinic';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Staff from '@/models/Staff';
import { ROLES } from '@/constants/roles';
import { generateToken } from '@/utils/generateToken';

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

export async function POST(req) {
  try {
    await dbConnect();
    
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
    const session = await Session.findOne({ 
      $or: [
        { refreshToken: refreshToken },
        { usedRefreshTokens: refreshToken }
      ]
    });

    if (!session) {
      return ApiResponse.error("Session not found", "SESSION_NOT_FOUND", [], 401);
    }

    // Token reuse detection: if the presented token is in the used list
    if (session.usedRefreshTokens.includes(refreshToken)) {
      // The session is compromised. Revoke it immediately.
      session.isActive = false;
      await session.save();
      return ApiResponse.error("Token reuse detected, session revoked", "SESSION_REVOKED", [], 401);
    }

    // If the token is the current active token but the session is inactive
    if (!session.isActive) {
      return ApiResponse.error("Session revoked", "SESSION_REVOKED", [], 401);
    }
    
    // Fetch user depending on role
    let user;
    const role = decoded.role;
    if (role === ROLES.ADMIN) user = await Admin.findById(decoded.id);
    else if (role === ROLES.CLINIC) user = await Clinic.findById(decoded.id);
    else if (role === ROLES.DOCTOR) user = await Doctor.findById(decoded.id);
    else if (role === ROLES.PATIENT) user = await Patient.findById(decoded.id);
    else if (role === ROLES.RECEPTIONIST) user = await Staff.findById(decoded.id);
    
    if (!user) {
      return ApiResponse.error("User not found", "USER_NOT_FOUND", [], 404);
    }
    
    // Generate new tokens (rotation)
    const tokens = generateToken(user, role, decoded.clinicId);
    
    // Move the current token to the used list
    session.usedRefreshTokens.push(session.refreshToken);

    // Update session with new refresh token
    session.refreshToken = tokens.refreshToken;
    session.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    session.lastActivityAt = Date.now();
    await session.save();
    
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
