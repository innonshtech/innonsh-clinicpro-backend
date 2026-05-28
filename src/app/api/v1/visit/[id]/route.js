import { withRoles } from '@/utils/authGuard';
import * as visitController from '@/controllers/visitController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * PATCH /api/v1/visit/:id
 * Partially update a visit (Save Progress)
 */
export const PATCH = withRoles(['doctor', 'admin'], async (req, { params }) => {
  try {
    return await visitController.updateVisit(req, { params });
  } catch (error) {
    console.error('Error in PATCH /api/v1/visit/[id]:', error);
    return ApiResponse.error('Internal Server Error', 'INTERNAL_ERROR', [], 500);
  }
});
