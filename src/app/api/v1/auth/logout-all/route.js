import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return ApiResponse.error('Missing authorization header', 'MISSING_TOKEN', [], 401);
    }

    const token = authHeader.split(' ')[1];
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return ApiResponse.error('Invalid token', 'INVALID_TOKEN', [], 401);
    }

    // Invalidate all sessions for this user
    await supabase.from('sessions').update({ is_active: false }).eq('user_id', decoded.id);
    
    const response = ApiResponse.success(null, "Logged out of all devices successfully");
    
    // Clear the current cookie if it exists
    response.cookies.set('refreshToken', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 0, 
    });
    
    return response;
    
  } catch (error) {
    console.error("Logout all devices error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
