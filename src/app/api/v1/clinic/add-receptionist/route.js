import { ApiResponse } from "@/utils/apiResponse";
import dbConnect from "@/utils/db";
import Staff from "@/models/Staff";
import bcrypt from "bcryptjs";

// POST: /api/v1/clinic/add-receptionist
/**
 * @swagger
 * /api/v1/clinic/add-receptionist:
 *   post:
 *     summary: POST request for /api/v1/clinic/add-receptionist
 *     tags: [Clinic]
 *     responses:
 *       200:
 *         description: Successful response
 */
export async function POST(req) {
  try {
    await dbConnect();
    const data = await req.json();

    if (!data.password) {
      return ApiResponse.error("Password is required", "VALIDATION_ERROR", [], 400);
    }

    // Hash password before saving
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);
    
    const newStaff = await Staff.create({
      ...data,
      password: hashedPassword
    });

    // Remove password from response
    const staffResponse = newStaff.toObject();
    delete staffResponse.password;

    return ApiResponse.success({ staff: staffResponse }, "Staff created successfully", 201);
  } catch (error) {
    console.error("Staff creation error:", error);
    if (error.code === 11000) {
      return ApiResponse.error("Email already exists", "DUPLICATE_ENTRY", [], 400);
    }
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}