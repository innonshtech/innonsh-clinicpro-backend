import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * GET /api/v1/lab/samples/[id]
 * View single sample details scoped to the authenticated lab.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Sample ID is required', 'BAD_REQUEST', [], 400);
    }

    const sample = await labSampleService.getSampleById(labId, id);
    if (!sample) {
      return ApiResponse.error('Sample not found or access denied', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ sample }, 'Sample details retrieved');
  })
);
