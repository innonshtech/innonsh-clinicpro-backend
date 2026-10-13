import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labReportService } from '@/services/labReportService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * POST /api/v1/lab/reports/[id]/reissue
 * Reissue an amended diagnostic report with audit tracking.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.ISSUE_REPORTS)) {
      return ApiResponse.error('Access Denied: Only Pathologists or Lab Directors are authorized to reissue diagnostic reports.', 'FORBIDDEN', [], 403);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Report ID parameter is required', 'BAD_REQUEST', [], 400);
    }

    const body = await req.json().catch(() => ({}));
    const { reissue_reason } = body;

    if (!reissue_reason || reissue_reason.trim().length < 5) {
      return ApiResponse.error('A detailed reason for report reissue (minimum 5 characters) is required', 'BAD_REQUEST', [], 400);
    }

    try {
      const result = await labReportService.reissueReport(labId, id, { reissue_reason }, req.user);
      return ApiResponse.success(result, `Diagnostic report reissued successfully as ${result?.amended_report?.report_number || result?.report_number || 'amended report'}`, 201);
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to reissue diagnostic report', 'REISSUE_FAILED', [], statusCode);
    }
  })
);
