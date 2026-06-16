import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { ApiResponse } from "@/utils/apiResponse";
import { generateToken } from "@/utils/generateToken";

/**
 * @swagger
 * /api/v1/doctor/auth/login:
 *   post:
 *     summary: POST request for /api/v1/doctor/auth/login
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function POST(req) {
  try {
    const { email, password } = await req.json();

    const { data: user, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return ApiResponse.error("User not found", "USER_NOT_FOUND", [], 404);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return ApiResponse.error("Invalid password", "INVALID_PASSWORD", [], 401);
    }

    user._id = user.id; // Map id for generateToken

    const tokens = generateToken(user, user.role || 'doctor');

    const { createSession } = await import('@/utils/sessionHelper');
    await createSession(req, user, tokens);

    const response = ApiResponse.success({
      token: tokens.accessToken,
      user: {
        id: user.id,
        name: `${user.first_name} ${user.last_name}`,
        email: user.email,
        role: user.role || 'doctor',
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
    console.error("Doctor login error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
