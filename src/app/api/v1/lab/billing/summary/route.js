import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labBillingService } from '@/services/labBillingService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/billing/summary
 * Returns financial summary cards calculated from persisted records.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VIEW_BILLING)) {
      return ApiResponse.error('Access Denied: You do not have permission to view billing summary.', 'FORBIDDEN', [], 403);
    }

    const summary = await labBillingService.getBillingSummary(labId);
    return ApiResponse.success(summary, 'Billing summary retrieved successfully');
  })
);
