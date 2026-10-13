import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * GET /api/v1/lab/samples/eligible-orders
 * List accepted orders ready for sample collection.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';

    const orders = await labSampleService.getEligibleOrders(labId, { search });
    return ApiResponse.success({ orders }, 'Eligible orders retrieved successfully');
  })
);
