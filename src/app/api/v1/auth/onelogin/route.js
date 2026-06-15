/**
 * onelogin/route.js - Unified login endpoint. Migrated from Mongoose to Supabase.
 * The API contract is IDENTICAL to the original. The frontend sends the same request.
 */
import { ApiResponse } from '@/utils/apiResponse';
import { generateToken } from '@/utils/generateToken';
import { rateLimit } from '@/utils/rateLimit';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { loginSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';
import { ROLES } from '@/constants/roles';

/**
 * @swagger
 * /api/v1/auth/onelogin:
 *   post:
 *     summary: Authenticate user and issue JWT
 *     description: Unified login for all user types.
 *     tags: [Auth]
 */
export const POST = withErrorHandler(async (req) => {
  const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
  const isDev = process.env.NODE_ENV === 'development';
  const limiter = await rateLimit(ip, { limit: isDev ? 100 : 10, windowMs: 15 * 60 * 1000, endpoint: 'onelogin' });

  if (!limiter.success) {
    return ApiResponse.error(
      'Too many login attempts. Please try again later.',
      'RATE_LIMIT_EXCEEDED',
      { reset: limiter.reset },
      429
    );
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return ApiResponse.error('Invalid JSON body', 'JSON_ERROR', [], 400);
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.error('Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
  }

  const { email, password } = parsed.data;
  const cleanEmail = email.trim().toLowerCase();

  // Search across all user tables in Supabase
  const tableLookup = [
    {
      table: 'admins',
      type: ROLES.ADMIN,
      format: (u) => ({ id: u.id, name: u.name || 'Admin', email: u.email, role: ROLES.ADMIN }),
      getClinicId: () => null,
    },
    {
      table: 'clinics',
      type: ROLES.CLINIC,
      format: (u) => ({ id: u.id, name: u.clinic_name, email: u.email, logo: u.logo, status: u.status, role: ROLES.CLINIC }),
      getClinicId: (u) => u.id,
    },
    {
      table: 'doctors',
      type: ROLES.DOCTOR,
      format: (u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`, email: u.email, role: ROLES.DOCTOR }),
      getClinicId: (u) => u.clinic_id,
    },
    {
      table: 'staff',
      type: ROLES.RECEPTIONIST,
      format: (u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`, email: u.email, role: ROLES.RECEPTIONIST }),
      getClinicId: (u) => u.clinic_id,
    },
    {
      table: 'patients',
      type: ROLES.PATIENT,
      format: (u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}`, email: u.email, role: ROLES.PATIENT }),
      getClinicId: (u) => u.clinic_id,
    },
  ];

  let found = null;
  for (const lookup of tableLookup) {
    try {
      const { data: user } = await supabase
        .from(lookup.table)
        .select('*')
        .ilike('email', cleanEmail)
        .maybeSingle();

      if (user) {
        found = { user, ...lookup };
        break;
      }
    } catch (err) {
      console.error(`[LOGIN ERROR] Exception scanning ${lookup.type}:`, err.message);
    }
  }

  if (!found) {
    return ApiResponse.error('User not found', 'USER_NOT_FOUND', [], 404);
  }

  const { user, format, type, getClinicId } = found;

  // Password comparison (bcrypt or plain for legacy data)
  const storedPassword = user.password || '';
  const isBcryptHash = storedPassword.startsWith('$2');
  const isMatch = isBcryptHash
    ? await bcrypt.compare(password, storedPassword)
    : password === storedPassword;

  if (!isMatch) {
    return ApiResponse.error('Invalid password', 'INVALID_PASSWORD', [], 401);
  }

  try {
    const clinicId = getClinicId(user);
    const tokens = generateToken(user, type, clinicId);

    const { createSession } = await import('@/utils/sessionHelper');
    await createSession(req, user, tokens);

    const response = ApiResponse.success({
      token: tokens.accessToken,
      user: format(user),
    }, 'Login successful');

    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err) {
    console.error('[LOGIN ERROR] Failed to finalize login:', err);
    return ApiResponse.error(`Finalization error: ${err.message}`, 'FINALIZATION_ERROR', err.stack, 500);
  }
});
