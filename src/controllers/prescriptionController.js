import { ApiResponse } from '@/utils/apiResponse';
import * as prescriptionService from '@/services/prescriptionService';
import { prescriptionCreateSchema } from '@/validations/userValidation';
import dbConnect from '@/utils/db';

/**
 * Controller to handle adding a prescription to a visit.
 */
export const createPrescription = async (req) => {
  await dbConnect();
  
  const body = await req.json();

  // 1. Validate request
  const parsed = prescriptionCreateSchema.safeParse(body);
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
    const visit = await prescriptionService.addPrescription(parsed.data, req.user);

    // 3. Return success response
    return ApiResponse.success(
      { visit }, 
      "Prescription added successfully", 
      201
    );
  } catch (error) {
    if (error.message.includes('Visit not found')) {
      return ApiResponse.error(error.message, 'NOT_FOUND', [], 404);
    }
    if (error.message.includes('Access Denied')) {
      return ApiResponse.error(error.message, 'FORBIDDEN', [], 403);
    }
    if (error.message.includes('Invalid Visit ID')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }
    
    console.error('Error in createPrescription controller:', error);
    throw error;
  }
};
