import { ApiResponse } from '@/utils/apiResponse';
import { generateToken } from '@/utils/generateToken';
import { rateLimit } from '@/utils/rateLimit';

import dbConnect from '@/utils/db';
import Admin from '@/models/Admin';
import Clinic from '@/models/Clinic';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
import Receptionist from '@/models/Staff';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { loginSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';
import { ROLES } from '@/constants/roles';

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('[AUTH ERROR] JWT_SECRET is not defined in environment variables.');
}

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
  const limiter = rateLimit(ip, { limit: isDev ? 100 : 10, windowMs: 15 * 60 * 1000 });
  
  if (!limiter.success) {
    return ApiResponse.error(
      'Too many login attempts. Please try again later.',
      'RATE_LIMIT_EXCEEDED',
      { reset: limiter.reset },
      429
    );
  }

  await dbConnect();
  let body;
  try {
    body = await req.json();
  } catch (e) {
    console.error('[LOGIN ERROR] Failed to parse JSON body');
    return ApiResponse.error('Invalid JSON body', 'JSON_ERROR', [], 400);
  }
  


  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return ApiResponse.error(
      'Validation failed',
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  const { email, password } = parsed.data;

  const userModels = [
    {
      model: Admin,
      type: ROLES.ADMIN,
      format: (user) => ({
        id: user._id,
        name: user.name || "Admin",
        email: user.email,
        role: ROLES.ADMIN,
      }),
    },
    {
      model: Clinic,
      type: ROLES.CLINIC,
      format: (user) => ({
        id: user._id,
        name: user.clinicName,
        email: user.email,
        logo: user.logo,
        status: user.status,
        role: ROLES.CLINIC,
      }),
    },
    {
      model: Doctor,
      type: ROLES.DOCTOR,
      format: (user) => ({
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: ROLES.DOCTOR,
      }),
    },
    {
      model: Receptionist,
      type: ROLES.RECEPTIONIST,
      format: (user) => ({
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: ROLES.RECEPTIONIST,
      }),
    },
    {
      model: Patient,
      type: ROLES.PATIENT,
      format: (user) => ({
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: ROLES.PATIENT,
      }),
    },
  ];



  const cleanEmail = email.trim().toLowerCase();
  let found = null;


  for (const modelInfo of userModels) {
    try {
      if (!modelInfo.model) {
        console.error(`[LOGIN ERROR] Model for ${modelInfo.type} is undefined!`);
        continue;
      }
      
      const user = await modelInfo.model.findOne({ 
        email: { $regex: `^${cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } 
      }).lean();

      if (user) {

        found = { user, format: modelInfo.format, type: modelInfo.type };
        break; // Stop at first match
      }
    } catch (err) {
      console.error(`[LOGIN ERROR] Exception scanning ${modelInfo.type}:`, err.message);
    }
  }

  if (!found) {

    return ApiResponse.error('User not found', 'USER_NOT_FOUND', [], 404);
  }

  const { user, format, type } = found;

  // Smart password comparison: Detect if stored password is a bcrypt hash
  const storedPassword = user.password || '';
  const isBcryptHash = storedPassword.startsWith('$2');
  const isMatch = isBcryptHash
    ? await bcrypt.compare(password, storedPassword)
    : password === storedPassword;

  if (!isMatch) {
    return ApiResponse.error('Invalid password', 'INVALID_PASSWORD', [], 401);
  }

  try {
    const token = generateToken(
      user, 
      user.role || type, 
      type === ROLES.CLINIC ? user._id.toString() : user.clinicId
    );



    return ApiResponse.success({
      token,
      user: format(user),
    }, 'Login successful');
  } catch (err) {
    console.error('[LOGIN ERROR] Failed to finalize login:', err);
    return ApiResponse.error(`Finalization error: ${err.message}`, 'FINALIZATION_ERROR', err.stack, 500);
  }
});
