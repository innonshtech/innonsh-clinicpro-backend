import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Session from '@/models/Session';

export async function POST(req) {
  try {
    await dbConnect();
    
    // Get refresh token from cookies
    const cookieHeader = req.headers.get('cookie');
    if (!cookieHeader) {
      return ApiResponse.success(null, "Logged out successfully");
    }
    
    const cookies = Object.fromEntries(
      cookieHeader.split('; ').map(c => {
        const parts = c.split('=');
        return [parts[0], decodeURIComponent(parts.slice(1).join('='))];
      })
    );
    
    const refreshToken = cookies['refreshToken'];
    
    if (refreshToken) {
      // Invalidate the session in the database
      await Session.findOneAndUpdate(
        { 
          $or: [
            { refreshToken: refreshToken },
            { usedRefreshTokens: refreshToken }
          ] 
        }, 
        { isActive: false }
      );
    }
    
    const response = ApiResponse.success(null, "Logged out successfully");
    
    // Clear the cookie
    response.cookies.set('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0, 
    });
    
    return response;
    
  } catch (error) {
    console.error("Logout error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
