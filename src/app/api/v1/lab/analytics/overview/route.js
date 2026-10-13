import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labAnalyticsService } from '@/services/labAnalyticsService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/analytics/overview
 * Returns aggregated operational KPI cards, trend charts, distributions, and recent workflow activity.
 * Scoped strictly to authenticated lab tenant.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VIEW_ANALYTICS)) {
      return ApiResponse.error('Forbidden: You lack permission to view laboratory analytics', 403);
    }

    const { searchParams } = new URL(req.url);
    const range = searchParams.get('range') || '7d';
    const startDate = searchParams.get('startDate') || null;
    const endDate = searchParams.get('endDate') || null;

    const overview = await labAnalyticsService.getAnalyticsOverview(labId, {
      range,
      startDate,
      endDate
    });

    return ApiResponse.success(overview, 'Analytics overview retrieved successfully');
  })
);
