import { withRoles } from '@/utils/authGuard';
import * as visitController from '@/controllers/visitController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * POST /api/v1/visit/notes
 * Saves clinical notes and follow-up details for an ongoing visit.
 */
export const POST = withRoles(['doctor'], async (req) => {
  try {
    return await visitController.saveVisitNotes(req);
  } catch (error) {
    console.error('Error in POST /api/v1/visit/notes:', error);
    return ApiResponse.error(`Server error: ${error.message}`, 'INTERNAL_ERROR', [], 500);
  }
});
