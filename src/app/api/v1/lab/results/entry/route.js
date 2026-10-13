import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';

/**
 * POST /api/v1/lab/results/entry
 * Enter and save diagnostic test results for a received sample
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const { sample_id, order_id, results } = body;
    if (!sample_id || !order_id) {
      return ApiResponse.error('sample_id and order_id are required', 'VALIDATION_ERROR', [], 400);
    }
    if (!Array.isArray(results) || results.length === 0) {
      return ApiResponse.error('At least one parameter result is required', 'VALIDATION_ERROR', [], 400);
    }

    try {
      const data = await labResultService.enterResults(labId, body, req.user);
      return ApiResponse.success(data, 'Test results entered and saved successfully', 201);
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to enter results', 'ENTRY_FAILED', [], statusCode);
    }
  })
);
