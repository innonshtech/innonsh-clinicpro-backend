import { ApiResponse } from '@/utils/apiResponse';
import * as queueService from '@/services/queueService';
import dbConnect from '@/utils/db';

/**
 * Controller to handle fetching the live doctor queue.
 */
export const getDoctorQueue = async (req, { params }) => {
  await dbConnect();
  const { id: doctorId } = await params;

  if (!doctorId) {
    return ApiResponse.error('Doctor ID is required', 'MISSING_FIELD', [], 400);
  }

  try {
    // 2. Call service
    const queueData = await queueService.getDoctorQueue(doctorId, req.user);

    // 3. Return success response
    return ApiResponse.success(
      queueData, 
      "Doctor queue fetched successfully"
    );
  } catch (error) {
    if (error.message.includes('Invalid Doctor ID')) {
      return ApiResponse.error(error.message, 'BAD_REQUEST', [], 400);
    }
    
    console.error('Error in getDoctorQueue controller:', error);
    throw error;
  }
};
