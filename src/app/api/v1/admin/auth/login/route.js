import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { ApiResponse } from "@/utils/apiResponse";
import { generateToken } from "@/utils/generateToken";

export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

/**
 * @swagger
 * /api/v1/admin/auth/login:
 *   post:
 *     summary: POST request for /api/v1/admin/auth/login
 *     tags: [Admin]
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
      .from('admins')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error) throw error;

    if (!user) {
      return ApiResponse.success({ error: "User not found" }, { status: 404 });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return ApiResponse.success({ error: "Invalid password" }, { status: 401 });
    }

    user._id = user.id;

    const tokens = generateToken(user, user.role);

    const { createSession } = await import('@/utils/sessionHelper');
    await createSession(req, user, tokens);

    const response = ApiResponse.success({
      message: "Login successful",
      token: tokens.accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
