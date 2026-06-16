import { ApiResponse } from "@/utils/apiResponse";
import { generateToken } from "@/utils/generateToken";
import { supabase } from "@/lib/supabase";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { loginSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';

import { ROLES } from "@/constants/roles";

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('[AUTH ERROR] JWT_SECRET is not defined in environment variables.');
}

/**
 * @swagger
 * /api/v1/auth/receptionist-login:
 *   post:
 *     summary: POST request for /api/v1/auth/receptionist-login
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Successful response
 */
export const POST = withErrorHandler(async (req) => {
    const body = await req.json();

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

    const { data: staff, error: sErr } = await supabase
      .from('staff')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (sErr) throw sErr;

    if (!staff) {
      return ApiResponse.error("Staff not found.", "USER_NOT_FOUND", [], 404);
    }

    // Support both plain-text (old users) and bcrypt hashed passwords (new users)
    let isPasswordValid = false;

    // Check if stored password is a bcrypt hash (starts with $2b$ or $2a$)
    const isBcryptHash = staff.password && staff.password.startsWith('$2');

    if (isBcryptHash) {
      // New user: use bcrypt comparison
      isPasswordValid = await bcrypt.compare(password, staff.password);
    } else {
      // Old user: plain text comparison (transition period)
      isPasswordValid = (password === staff.password);
    }

    if (!isPasswordValid) {
      return ApiResponse.error("Invalid password.", "INVALID_PASSWORD", [], 401);
    }

    const { password: _, ...staffData } = staff;
    staffData._id = staffData.id;
    staff._id = staff.id;

    if (staffData.clinic_id) {
      const { data: clinicObj } = await supabase
        .from('clinics')
        .select('name') // Adjust depending on table (maybe name or clinic_name)
        .eq('id', staffData.clinic_id)
        .maybeSingle();

      if (clinicObj) {
        staffData.clinicName = clinicObj.name || clinicObj.clinic_name; // Fallback map
      }
    }

    const tokens = generateToken(staff, ROLES.RECEPTIONIST, staff.clinic_id);

    const { createSession } = await import('@/utils/sessionHelper');
    await createSession(req, { ...staffData, role: ROLES.RECEPTIONIST }, tokens);

    const response = ApiResponse.success({
      token: tokens.accessToken,
      staff: staffData
    }, "Login successful");

    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;

});