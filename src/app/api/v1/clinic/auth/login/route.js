import dbConnect from "@/utils/db";
import Clinic from "@/models/Clinic";
import Staff from "@/models/Staff";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
    await dbConnect();
    const { email, password } = await req.json();

    if (!email || !password) {
      return ApiResponse.error("Email and password are required", "VALIDATION_ERROR", [], 400);
    }

    // 1. Try to find in Clinic collection
    let user = await Clinic.findOne({ email });
    let role = 'clinic';
    let clinicId = null;
    let name = '';

    if (!user) {
      // 2. Try to find in Staff collection (receptionists)
      user = await Staff.findOne({ email });
      if (user) {
        role = 'receptionist';
        clinicId = user.clinicId;
        name = `${user.firstName} ${user.lastName}`;
      }
    } else {
      clinicId = user._id; // For clinic admin, they are their own clinicId
      name = user.clinicName;
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

    const tokens = generateToken(user, user.role || role, clinicId);

    // Create session in DB
    const { default: Session } = await import('@/models/Session');
    const ip = req.headers.get('x-forwarded-for') || '127.0.0.1';
    const device = req.headers.get('user-agent') || 'unknown';
    await Session.create({
      userId: user._id,
      userRole: user.role || role,
      refreshToken: tokens.refreshToken,
      ipAddress: ip,
      device: device,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });

    const response = ApiResponse.success({
      token: tokens.accessToken,
      user: {
        id: user._id,
        name: name,
        email: user.email,
        logo: user.logo || null,
        role: user.role || role,
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
