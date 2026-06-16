import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { ApiResponse } from "@/utils/apiResponse";
import { generateToken } from "@/utils/generateToken";


/**
 * @swagger
 * /api/v1/clinic/auth/login:
 *   post:
 *     summary: POST request for /api/v1/clinic/auth/login
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Successful response
 */
export async function POST(req) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return ApiResponse.error("Email and password are required", "VALIDATION_ERROR", [], 400);
    }

    // 1. Try to find in clinics
    const { data: clinic, error: cErr } = await supabase
      .from('clinics')
      .select('*')
      .eq('email', email)
      .maybeSingle();
      
    let user = clinic;
    let role = 'clinic';
    let clinicId = null;
    let name = '';

    if (!user) {
      // 2. Try to find in staff (receptionists)
      const { data: staff, error: sErr } = await supabase
        .from('staff')
        .select('*')
        .eq('email', email)
        .maybeSingle();

      if (staff) {
        user = staff;
        role = staff.role || 'receptionist';
        clinicId = staff.clinic_id;
        name = `${staff.first_name} ${staff.last_name}`;
        user._id = staff.id;
      }
    } else {
      clinicId = user.id; // For clinic admin, they are their own clinicId
      name = user.name;
      role = user.role || 'clinic';
      user._id = user.id;
    }

    if (!user) {
      return ApiResponse.error("User not found", "USER_NOT_FOUND", [], 404);
    }


    // Support both plain-text (old users) and bcrypt hashed passwords (new users)
    let isPasswordValid = false;
    const isBcryptHash = user.password && user.password.startsWith('$2');

    if (isBcryptHash) {
      isPasswordValid = await bcrypt.compare(password, user.password);
    } else {
      isPasswordValid = (password === user.password);
    }

    if (!isPasswordValid) {
      return ApiResponse.error("Invalid password", "INVALID_PASSWORD", [], 401);
    }

    const tokens = generateToken(user, role, clinicId);

    const { createSession } = await import('@/utils/sessionHelper');
    await createSession(req, user, tokens);

    const response = ApiResponse.success({
      token: tokens.accessToken,
      user: {
        id: user._id,
        name: name,
        email: user.email,
        logo: user.logo || null,
        role: role,
        clinicId: clinicId
      },
    }, "Login successful");

    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Unified login error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
