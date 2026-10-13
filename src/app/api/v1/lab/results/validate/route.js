import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * POST /api/v1/lab/results/validate
 * Sign off and validate diagnostic test results
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VALIDATE_RESULTS)) {
      return ApiResponse.error('Access Denied: Laboratory technicians are not authorized to validate or sign off on diagnostic results.', 'FORBIDDEN', [], 403);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const { result_ids, validation_remarks } = body;
    if (!Array.isArray(result_ids) || result_ids.length === 0) {
      return ApiResponse.error('At least one result_id is required for validation', 'VALIDATION_ERROR', [], 400);
    }

    try {
      const data = await labResultService.validateResults(labId, { result_ids, validation_remarks }, req.user);
      return ApiResponse.success(data, 'Test results successfully validated and signed off');
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to validate results', 'VALIDATION_FAILED', [], statusCode);
    }
  })
);
