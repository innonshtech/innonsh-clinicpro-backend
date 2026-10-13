import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labReportService } from '@/services/labReportService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/reports/eligible-orders
 * List orders and specimens eligible for diagnostic report generation.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.ISSUE_REPORTS)) {
      return ApiResponse.error('Access Denied: Only Pathologists or Lab Directors can access the report generation queue.', 'FORBIDDEN', [], 403);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';

    const eligibleOrders = await labReportService.listEligibleOrdersForReport(labId, { search, status });

    return ApiResponse.success({ eligibleOrders, count: eligibleOrders.length }, 'Eligible orders for reporting retrieved');
  })
);
