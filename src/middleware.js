import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { 
  publicApiLimiter, 
  loginLimiter, 
  passwordResetLimiter, 
  otpLimiter, 
  uploadLimiter,
  getIP, 
  getRateLimitHeaders 
} from './lib/rate-limit';

// Configurable allowed origins via env
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://innonsh-clinicpro-frontend.vercel.app,https://clinicpro.innonsh.com')
  .split(',')
  .map((o) => o.trim());

const CORS_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const CORS_HEADERS = 'Content-Type,Authorization';

function setCors(response, origin) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  } else if (!origin) {
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else {
    response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  response.headers.set('Access-Control-Allow-Methods', CORS_METHODS);
  response.headers.set('Access-Control-Allow-Headers', CORS_HEADERS);
  return response;
}

const PUBLIC_PATHS = [
  '/login',
  '/receptionist-login',
  '/onelogin',
  '/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/password',
  '/otp',
  '/verify',
  '/send',
  '/upload'
];

const ROLE_PATHS = {
  '/api/v1/admin': ['admin'],
  '/api/v1/doctor/fetchall': ['doctor', 'admin', 'receptionist', 'clinic'],
  '/api/v1/doctor/availability': ['doctor', 'admin', 'receptionist', 'clinic'],
  '/api/v1/doctor/fetch-by-id': ['doctor', 'admin', 'receptionist', 'clinic'],
  '/api/v1/doctor': ['doctor', 'admin'],
  '/api/v1/clinic': ['clinic', 'receptionist', 'admin'],
  '/api/v1/receptionist': ['receptionist', 'clinic', 'admin'],
  '/api/v1/patient': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/appointment': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/billing': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/visit': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/prescription': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/followup': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/queue': ['patient', 'doctor', 'clinic', 'receptionist', 'admin'],
};

export async function middleware(request) {
  const origin = request.headers.get('origin');

  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    setCors(response, origin);
    return response;
  }

  const path = request.nextUrl.pathname.toLowerCase();
  let limiter = publicApiLimiter;

  if (path.includes('/login') || path.includes('/receptionist-login') || path.includes('/onelogin')) {
    limiter = loginLimiter;
  } else if (path.includes('/forgot-password') || path.includes('/reset-password') || path.includes('/password')) {
    limiter = passwordResetLimiter;
  } else if (path.includes('/otp') || path.includes('/verify') || path.includes('/send')) {
    limiter = otpLimiter;
  } else if (path.includes('/upload')) {
    limiter = uploadLimiter;
  }

  const ip = getIP(request);
  const rateLimitResult = await limiter.limit(ip);
  
  if (!rateLimitResult.success) {
    console.warn(`[RateLimit] Limit exceeded for IP: ${ip} on ${path}`);
    const headers = getRateLimitHeaders(rateLimitResult);
    
    const response = NextResponse.json(
      { success: false, message: 'Too many requests. Please try again later.' },
      { status: 429 }
    );
    
    Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
    setCors(response, origin);
    return response;
  }

  // Centralized RBAC Authorization
  const isPublicPath = PUBLIC_PATHS.some(publicPath => path.includes(publicPath));
  let decodedUser = null;

  if (!isPublicPath) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json({ success: false, message: 'Missing or invalid authorization header', errorCode: 'MISSING_TOKEN' }, { status: 401 });
      setCors(response, origin);
      return response;
    }

    const token = authHeader.split(' ')[1].trim();
    const JWT_SECRET = process.env.JWT_SECRET;
    
    if (!JWT_SECRET) {
      console.error('[AUTH ERROR] JWT_SECRET is not defined');
      return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
    }

    try {
      const secretKey = new TextEncoder().encode(JWT_SECRET);
      const { payload } = await jwtVerify(token, secretKey);
      decodedUser = payload;
    } catch (error) {
      const response = NextResponse.json({ success: false, message: 'Token verification failed or expired', errorCode: 'INVALID_TOKEN' }, { status: 401 });
      setCors(response, origin);
      return response;
    }

    if (!decodedUser || !decodedUser.role) {
      const response = NextResponse.json({ success: false, message: 'User role is undefined', errorCode: 'UNDEFINED_ROLE' }, { status: 403 });
      setCors(response, origin);
      return response;
    }

    let requiredRoles = null;
    for (const [prefix, roles] of Object.entries(ROLE_PATHS)) {
      if (path.startsWith(prefix.toLowerCase())) {
        requiredRoles = roles;
        break;
      }
    }

    if (requiredRoles && requiredRoles.length > 0) {
      const userRole = decodedUser.role.toLowerCase();
      const normalizedAllowedRoles = requiredRoles.map(r => r.toLowerCase());

      if (!normalizedAllowedRoles.includes(userRole)) {
        const response = NextResponse.json({ 
          success: false, 
          message: `Access Denied. Required roles: ${requiredRoles.join(', ')}`, 
          errorCode: 'FORBIDDEN',
          yourRole: decodedUser.role
        }, { status: 403 });
        setCors(response, origin);
        return response;
      }
    }
  }

  const response = NextResponse.next();
  setCors(response, origin);
  
  const successHeaders = getRateLimitHeaders(rateLimitResult);
  Object.entries(successHeaders).forEach(([key, value]) => response.headers.set(key, value));
  
  // Inject user info into headers to act as downstream context
  if (decodedUser) {
    const userId = decodedUser.id || decodedUser._id;
    if (userId) response.headers.set('x-user-id', userId.toString());
    response.headers.set('x-user-role', decodedUser.role);
    if (decodedUser.clinicId) {
      response.headers.set('x-user-clinic-id', decodedUser.clinicId.toString());
    }
  }

  return response;
}

export const config = {
  matcher: '/api/v1/:path*',
};
