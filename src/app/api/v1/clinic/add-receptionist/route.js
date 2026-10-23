import { ApiResponse } from "@/utils/apiResponse";
import { supabase } from "@/lib/supabase";
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import bcrypt from "bcryptjs";

// POST: /api/v1/clinic/add-receptionist
export const POST = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req) => {
    let data;
    try { data = await req.json(); } catch (_) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId && data.clinicId && String(req.user.clinicId) !== String(data.clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const phoneVal = data.phone || data.phoneNumber;
    if (phoneVal && !/^[0-9]{10}$/.test(String(phoneVal).trim())) {
      return ApiResponse.error("Phone number must be exactly 10 numeric digits", "VALIDATION_ERROR", [], 400);
    }

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
      clinic_id: data.clinicId || req.user?.clinicId,
      role: data.role || 'receptionist',
      status: data.status || 'active'
    };

    const { data: newStaffData, error } = await supabase
      .from('staff')
      .insert([staffPayload])
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return ApiResponse.error("Email already exists", "DUPLICATE_ENTRY", [], 400);
      }
      throw error;
    }

    // Remap for frontend
    const staffResponse = {
      ...newStaffData,
      _id: newStaffData.id,
      firstName: newStaffData.first_name,
      lastName: newStaffData.last_name,
      clinicId: newStaffData.clinic_id
    };
    
    delete staffResponse.password;

    return ApiResponse.success({ staff: staffResponse }, "Staff created successfully", 201);
  })
);
