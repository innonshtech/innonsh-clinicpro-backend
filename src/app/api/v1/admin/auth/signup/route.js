import { ApiResponse } from "@/utils/apiResponse";
import dbConnect from "@/utils/db";
import Admin from "@/models/Admin";
import bcrypt from "bcryptjs";

/**
 * @swagger
 * /api/v1/admin/auth/signup:
 *   post:
 *     summary: POST request for /api/v1/admin/auth/signup
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
    await dbConnect();
    const { name, email, password, role, secret } = await req.json();

    // 1. Check if an admin already exists
    const adminCount = await Admin.countDocuments();
    if (adminCount > 0) {
      return ApiResponse.error("Admin already exists. Multiple admin registrations are disabled.", "FORBIDDEN", [], 403);
    }

    // 2. Check for the Secret Key (Required for the very first admin)
    const signupSecret = process.env.ADMIN_SIGNUP_SECRET || "DEFAULT_SECRET";
    if (secret !== signupSecret) {
      return ApiResponse.error("Invalid signup secret. Unauthorized admin creation.", "UNAUTHORIZED", [], 401);
    }

    const userExists = await Admin.findOne({ email });
    if (userExists) {
      return ApiResponse.error("User already exists", "CONFLICT", [], 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = await Admin.create({ name, email, password: hashedPassword, role });

    return ApiResponse.success({ adminId: admin._id }, "Super Admin created successfully", 201);
  } catch (error) {
    console.error("Admin signup error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}