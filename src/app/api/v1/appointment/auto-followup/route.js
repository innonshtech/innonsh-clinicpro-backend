import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * POST /api/v1/appointment/auto-followup
 * Internal endpoint to trigger follow-up appointment creation.
 */
export const POST = withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
  try {
    return await appointmentController.createAutoFollowup(req);
  } catch (error) {
    console.error('Error in POST /api/v1/appointment/auto-followup:', error);
    return ApiResponse.error(`Server error: ${error.message}`, 'INTERNAL_ERROR', [], 500);
  }
});
