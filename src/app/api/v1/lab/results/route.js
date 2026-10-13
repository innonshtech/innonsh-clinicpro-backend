import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labResultService } from '@/services/labResultService';

/**
 * GET /api/v1/lab/results
 * List diagnostic results scoped strictly to authenticated laboratory.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const orderId = searchParams.get('orderId') || null;
    const sampleId = searchParams.get('sampleId') || null;
    const isCriticalParam = searchParams.get('isCritical');
    const isCritical = isCriticalParam !== null ? isCriticalParam === 'true' : null;

    const results = await labResultService.listResults(labId, { search, status, orderId, sampleId, isCritical });
    return ApiResponse.success({ results }, 'Diagnostic results retrieved successfully');
  })
);
