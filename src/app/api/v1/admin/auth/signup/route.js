import { ApiResponse } from "@/utils/apiResponse";
import { supabase } from "@/lib/supabase";
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
    const { name, email, password, role, secret } = await req.json();

    // 1. Check if an admin already exists
    const { count: adminCount, error: countErr } = await supabase
      .from('admins')
      .select('id', { count: 'exact', head: true });

    if (countErr) throw countErr;

    if (adminCount > 0) {
      return ApiResponse.error("Admin already exists. Multiple admin registrations are disabled.", "FORBIDDEN", [], 403);
    }

    // 2. Check for the Secret Key (Required for the very first admin)
    const signupSecret = process.env.ADMIN_SIGNUP_SECRET || "DEFAULT_SECRET";
    if (secret !== signupSecret) {
      return ApiResponse.error("Invalid signup secret. Unauthorized admin creation.", "UNAUTHORIZED", [], 401);
    }

    const { data: userExists, error: existErr } = await supabase
      .from('admins')
      .select('id')
      .eq('email', email)
      .maybeSingle();

    if (existErr) throw existErr;

    if (userExists) {
      return ApiResponse.error("User already exists", "CONFLICT", [], 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const { data: admin, error: insertErr } = await supabase
      .from('admins')
      .insert({ name, email, password: hashedPassword, role })
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    return ApiResponse.success({ adminId: admin.id }, "Super Admin created successfully", 201);
  } catch (error) {
    console.error("Admin signup error:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}