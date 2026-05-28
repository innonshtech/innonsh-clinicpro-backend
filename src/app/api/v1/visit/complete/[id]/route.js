import { withRoles } from '@/utils/authGuard';
import * as visitController from '@/controllers/visitController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * POST /api/v1/visit/complete/:id
 * Mark a visit as completed
 */
import { withErrorHandler } from '@/utils/apiHandler';

export const POST = withErrorHandler(
  withRoles(['doctor', 'admin'], async (req, { params }) => {
    return await visitController.completeVisit(req, { params });
  })
);
