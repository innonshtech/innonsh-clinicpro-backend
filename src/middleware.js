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
const DEFAULT_CORS_HEADERS = 'Content-Type,Authorization,X-Requested-With,Accept,Origin';

function isOriginAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin)) return true;

  try {
    const url = new URL(origin);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      const altHost = url.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
      const altOrigin = `${url.protocol}//${altHost}${url.port ? ':' + url.port : ''}`;
      if (ALLOWED_ORIGINS.includes(altOrigin)) return true;
    }
  } catch (_) {}

  return false;
}

function setCors(response, requestOrOrigin) {
  const origin = typeof requestOrOrigin === 'string'
    ? requestOrOrigin
    : requestOrOrigin?.headers?.get('origin');
  const req = typeof requestOrOrigin === 'object' && requestOrOrigin !== null
    ? requestOrOrigin
    : null;

  if (origin && isOriginAllowed(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
  }

  response.headers.set('Access-Control-Allow-Methods', CORS_METHODS);

  const requestedHeaders = req?.headers?.get('access-control-request-headers');
  if (requestedHeaders) {
    const headerSet = new Set(
      DEFAULT_CORS_HEADERS.split(',').map((h) => h.trim()).concat(
        requestedHeaders.split(',').map((h) => h.trim())
      )
    );
    response.headers.set('Access-Control-Allow-Headers', Array.from(headerSet).join(', '));
  } else {
    response.headers.set('Access-Control-Allow-Headers', DEFAULT_CORS_HEADERS);
  }

  if (req?.headers?.get('access-control-request-private-network') === 'true') {
    response.headers.set('Access-Control-Allow-Private-Network', 'true');
  }

  response.headers.set('Access-Control-Max-Age', '86400');
  response.headers.set('Vary', 'Origin, Access-Control-Request-Headers, Access-Control-Request-Method');

  return response;
}

const PUBLIC_PATHS = [
  '/login',
  '/receptionist-login',
  '/onelogin',
  '/api/v1/auth',

  '/api/v1/clinic/register',
  '/api/v1/doctor/register',
  '/api/v1/receptionist/register',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/password',
  '/otp',
  '/verify',
  '/send',
  '/upload',
  '/check-email',
  '/api/v1/clinic/fetch-by-id',
  '/api/v1/doctor/fetch-by-id',
  '/api/v1/clinic/fetch-doctor-clinicid',
  '/api/v1/clinic/fetch-images'
];

const ROLE_PATHS = {
  '/api/v1/lab/orders': ['doctor', 'receptionist', 'clinic', 'lab', 'admin'],
  '/api/v1/lab/active': ['doctor', 'receptionist', 'clinic', 'lab', 'admin'],
  '/api/v1/lab/catalog': ['doctor', 'receptionist', 'clinic', 'lab', 'admin'],
  '/api/v1/lab': ['admin', 'lab'],
  '/api/v1/admin': ['admin'],
  '/api/v1/doctor/fetchall': ['doctor', 'admin', 'receptionist', 'clinic'],
  '/api/v1/doctor/availability': ['doctor', 'admin', 'receptionist', 'clinic'],
  '/api/v1/doctor/fetch-by-id': ['doctor', 'admin', 'receptionist', 'clinic'],
  '/api/v1/doctor/update-by-id': ['doctor', 'clinic', 'admin'],
  '/api/v1/doctor': ['doctor', 'admin'],
  '/api/v1/clinic/fetchprofiledata': ['doctor', 'clinic', 'receptionist', 'admin', 'nurse'],
  '/api/v1/clinic/fetch-patients': ['doctor', 'clinic', 'receptionist', 'admin'],
  '/api/v1/clinic/nurses': ['doctor', 'clinic', 'admin', 'nurse', 'receptionist'],
  '/api/v1/ipd': ['doctor', 'clinic', 'admin', 'nurse', 'receptionist', 'housekeeping', 'lab'],
  '/api/v1/clinic': ['clinic', 'receptionist', 'admin'],
  '/api/v1/receptionist': ['receptionist', 'clinic', 'admin'],
  '/api/v1/patient/register': ['receptionist'],
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
    setCors(response, request);
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
    setCors(response, request);
    return response;
  }

  // Centralized RBAC Authorization
  const isPublicPath = !path.startsWith('/api/v1/ipd') && PUBLIC_PATHS.some(publicPath => {
    return path === publicPath || path.startsWith(publicPath + '/') || (publicPath.startsWith('/api/') && path.startsWith(publicPath));
  });
  let decodedUser = null;

  if (!isPublicPath) {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      const response = NextResponse.json({ success: false, message: 'Missing or invalid authorization header', errorCode: 'MISSING_TOKEN' }, { status: 401 });
      setCors(response, request);
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
      setCors(response, request);
      return response;
    }

    if (!decodedUser || !decodedUser.role) {
      const response = NextResponse.json({ success: false, message: 'User role is undefined', errorCode: 'UNDEFINED_ROLE' }, { status: 403 });
      setCors(response, request);
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
        setCors(response, request);
        return response;
      }
    }
  }

  const requestHeaders = new Headers(request.headers);
  
  // Inject user info into headers to act as downstream context
  if (decodedUser) {
    const userId = decodedUser.id || decodedUser._id;
    if (userId) requestHeaders.set('x-user-id', userId.toString());
    requestHeaders.set('x-user-role', decodedUser.role);
    if (decodedUser.clinicId) {
      requestHeaders.set('x-user-clinic-id', decodedUser.clinicId.toString());
    }
    if (decodedUser.labId) {
      requestHeaders.set('x-user-lab-id', decodedUser.labId.toString());
    }
    if (decodedUser.labRole) {
      requestHeaders.set('x-lab-role', decodedUser.labRole.toString());
    }
    if (decodedUser.permissions && Array.isArray(decodedUser.permissions)) {
      requestHeaders.set('x-lab-permissions', JSON.stringify(decodedUser.permissions));
    }
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  
  setCors(response, request);
  
  const successHeaders = getRateLimitHeaders(rateLimitResult);
  Object.entries(successHeaders).forEach(([key, value]) => response.headers.set(key, value));

  return response;
}

export const config = {
  matcher: '/api/v1/:path*',
};
