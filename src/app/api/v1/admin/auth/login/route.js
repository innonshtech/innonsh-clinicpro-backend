import dbConnect from "@/utils/db";
import Admin from "@/models/Admin";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
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
  await dbConnect();

  const { email, password } = await req.json();

  const user = await Admin.findOne({ email });
  if (!user) {
    const res = ApiResponse.success({ error: "User not found" }, { status: 404 });
    return
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    const res = ApiResponse.success({ error: "Invalid password" }, { status: 401 });
    return
  }

  const token = generateToken(user, user.role);


  return ApiResponse.success({
    message: "Login successful",
    token,
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
}

