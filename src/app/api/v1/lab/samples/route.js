import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * GET /api/v1/lab/samples
 * List diagnostic samples scoped strictly to authenticated laboratory.
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

    const samples = await labSampleService.listSamples(labId, { search, status, orderId });
    return ApiResponse.success({ samples }, 'Samples retrieved successfully');
  })
);
