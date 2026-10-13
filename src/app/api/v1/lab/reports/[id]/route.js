import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labReportService } from '@/services/labReportService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/reports/[id]
 * Get single report details scoped strictly to authenticated laboratory.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VIEW_REPORTS)) {
      return ApiResponse.error('Access Denied: You do not have permission to view diagnostic reports.', 'FORBIDDEN', [], 403);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Report ID parameter is required', 'BAD_REQUEST', [], 400);
    }

    const report = await labReportService.getReportById(labId, id);
    if (!report) {
      return ApiResponse.error('Diagnostic report not found or access denied', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ report }, 'Diagnostic report retrieved successfully');
  })
);
