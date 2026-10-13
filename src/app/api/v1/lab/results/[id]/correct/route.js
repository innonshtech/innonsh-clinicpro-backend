import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * POST /api/v1/lab/results/[id]/correct
 * Correct an already validated result while preserving audit history
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VALIDATE_RESULTS)) {
      return ApiResponse.error('Access Denied: Only pathologists and laboratory administrators can correct validated results.', 'FORBIDDEN', [], 403);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Result ID is required', 'BAD_REQUEST', [], 400);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    try {
      const data = await labResultService.correctValidatedResult(labId, id, body, req.user);
      return ApiResponse.success(data, 'Validated result corrected and queued for re-validation');
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to correct result', 'CORRECTION_FAILED', [], statusCode);
    }
  })
);
