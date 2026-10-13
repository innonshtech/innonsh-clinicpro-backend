import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';

/**
 * GET /api/v1/lab/results/eligible-samples
 * List received samples eligible for result entry
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const samples = await labResultService.listEligibleSamplesForEntry(labId, { search });
    return ApiResponse.success({ samples }, 'Eligible received samples retrieved successfully');
  })
);
