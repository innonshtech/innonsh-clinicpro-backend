import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * POST /api/v1/lab/samples/[id]/recollect
 * Flag a rejected sample for recollection and create linked replacement specimen.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Sample ID is required', 'BAD_REQUEST', [], 400);
    }

    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      // Optional body
    }

    try {
      const result = await labSampleService.requestRecollection(labId, id, body, req.user);
      return ApiResponse.success(result, 'Recollection requested and replacement sample created', 201);
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to request recollection', 'RECOLLECTION_FAILED', [], statusCode);
    }
  })
);
