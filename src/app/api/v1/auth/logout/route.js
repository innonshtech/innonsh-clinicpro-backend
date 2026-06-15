import { ApiResponse } from '@/utils/apiResponse';
import { invalidateSession } from '@/utils/sessionHelper';

export async function POST(req) {
  try {
    // Get refresh token from cookies
    const cookieHeader = req.headers.get('cookie');
    
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split('; ').map(c => {
          const parts = c.split('=');
          return [parts[0], decodeURIComponent(parts.slice(1).join('='))];
        })
      );

      const refreshToken = cookies['refreshToken'];
      if (refreshToken) {
        // Invalidate the session in Supabase
        await invalidateSession(refreshToken);
      }
    }

    const response = ApiResponse.success(null, 'Logged out successfully');

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
    console.error('Logout error:', error);
    return ApiResponse.error('Internal Server Error', 'SERVER_ERROR', error.message, 500);
  }
}
