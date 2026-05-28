import { withRoles } from '@/utils/authGuard';
import * as followupController from '@/controllers/followupController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * GET /api/v1/followup/list
 * Fetches upcoming follow-up appointments for receptionists/admin
 */
export const GET = withRoles(['receptionist', 'admin', 'doctor'], async (req) => {
  try {
    return await followupController.listFollowups(req);
  } catch (error) {
    console.error('Error in GET /api/v1/followup/list:', error);
    return ApiResponse.error(`Server error: ${error.message}`, 'INTERNAL_ERROR', error.stack, 500);
  }
});
