import dbConnect from "@/utils/db";
import Doctor from "@/models/Doctor";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
    await dbConnect();
    const { email, password } = await req.json();

    const user = await Doctor.findOne({ email });
    if (!user) {
      return ApiResponse.error("User not found", "USER_NOT_FOUND", [], 404);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return ApiResponse.error("Invalid password", "INVALID_PASSWORD", [], 401);
    }

    const tokens = generateToken(user, user.role);

    // Create session in DB
    const { default: Session } = await import('@/models/Session');
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const device = req.headers.get('user-agent') || 'unknown';
    await Session.create({
      userId: user._id,
      userRole: user.role,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      device: device,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    const response = ApiResponse.success({
      token: tokens.accessToken,
      user: {
        id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        role: user.role,
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
