import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';

/**
 * GET /api/v1/lab/results/critical
 * List critical panic findings
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all'; // all, unacknowledged, acknowledged

    const criticalResults = await labResultService.listCriticalResults(labId, { status, search });
    return ApiResponse.success({ criticalResults }, 'Critical results retrieved successfully');
  })
);
