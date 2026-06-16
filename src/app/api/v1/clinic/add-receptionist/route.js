import { ApiResponse } from "@/utils/apiResponse";
import { supabase } from "@/lib/supabase";
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
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function POST(req) {
  try {
    const data = await req.json();

    if (!data.password) {
      return ApiResponse.error("Password is required", "VALIDATION_ERROR", [], 400);
    }

    // Hash password before saving
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(data.password, salt);
    
    const staffPayload = {
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email,
      phone: data.phone || data.phoneNumber,
      password: hashedPassword,
      clinic_id: data.clinicId,
      role: data.role || 'receptionist',
      status: data.status || 'active'
    };

    const { data: newStaffData, error } = await supabase
      .from('staff')
      .insert([staffPayload])
      .select()
      .single();

    if (error) throw error;

    // Remap for frontend
    const staffResponse = {
      ...newStaffData,
      _id: newStaffData.id,
      firstName: newStaffData.first_name,
      lastName: newStaffData.last_name,
      clinicId: newStaffData.clinic_id
    };
    
    // Remove password from response
    delete staffResponse.password;

    return ApiResponse.success({ staff: staffResponse }, "Staff created successfully", 201);
  } catch (error) {
    console.error("Staff creation error:", error);
    if (error.code === '23505') {
      return ApiResponse.error("Email already exists", "DUPLICATE_ENTRY", [], 400);
    }
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}