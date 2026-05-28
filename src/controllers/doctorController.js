import * as doctorService from '@/services/doctorService';
import { ApiResponse } from '@/utils/apiResponse';
import { doctorAvailabilitySchema } from '@/validations/userValidation';
import dbConnect from '@/utils/db';

/**
 * Controller to set doctor availability.
 */
export const setAvailability = async (req) => {
  await dbConnect();
  const body = await req.json();

  // 1. Validate request
  const parsed = doctorAvailabilitySchema.safeParse(body);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'Validation failed';
    return ApiResponse.error(
      firstError,
      'VALIDATION_ERROR',
      parsed.error.format(),
      400
    );
  }

  try {
    // 2. Call service
    const availability = await doctorService.setDoctorAvailability(parsed.data, req.user);
    
    return ApiResponse.success(
      availability, 
      "Doctor availability saved successfully", 
      201
    );

  } catch (error) {
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }
    if (error.message.includes('Duplicate slots')) {
      return ApiResponse.error(error.message, 'VALIDATION_ERROR', [], 400);
    }

    console.error('Error in setAvailability controller:', error);
    throw error;
  }
};

/**
 * Controller to fetch available slots for a doctor.
 */
export const getAvailability = async (req) => {
  await dbConnect();
  
  // 1. Extract query params
  const { searchParams } = new URL(req.url);
  const doctorId = searchParams.get('doctorId');
  const date = searchParams.get('date');

  if (!doctorId || !date) {
    return ApiResponse.error("Doctor ID and Date are required", "VALIDATION_ERROR", [], 400);
  }

  try {
    // 2. Call service
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return ApiResponse.error('Authentication token missing', 'UNAUTHORIZED', [], 401);
    }
    const slots = await doctorService.getAvailableSlots(doctorId, date, token);

    
    return ApiResponse.success(
      slots, 
      "Available slots fetched successfully"
    );

  } catch (error) {
    console.error('Error in getAvailability controller:', error);
    throw error;
  }
};
