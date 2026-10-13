import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';

/**
 * POST /api/v1/lab/results/[id]/acknowledge
 * Acknowledge a critical finding
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Result ID is required', 'BAD_REQUEST', [], 400);
    }

    let body = {};
    try {
      body = await req.json();
    } catch (e) {}

    try {
      const data = await labResultService.acknowledgeCriticalResult(labId, id, body, req.user);
      return ApiResponse.success({ result: data }, 'Critical result successfully acknowledged and logged');
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to acknowledge critical result', 'ACKNOWLEDGE_FAILED', [], statusCode);
    }
  })
);
