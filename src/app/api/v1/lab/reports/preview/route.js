import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labReportService } from '@/services/labReportService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/reports/preview
 * Generate in-memory diagnostic report preview snapshot without persisting.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.ISSUE_REPORTS)) {
      return ApiResponse.error('Access Denied: Only Pathologists or Lab Directors are authorized to preview and issue diagnostic reports.', 'FORBIDDEN', [], 403);
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('orderId');
    const sampleId = searchParams.get('sampleId');

    if (!orderId && !sampleId) {
      return ApiResponse.error('orderId or sampleId query parameter is required', 'BAD_REQUEST', [], 400);
    }

    try {
      const preview = await labReportService.previewReport(labId, { orderId, sampleId });
      return ApiResponse.success({ preview }, 'Diagnostic report preview compiled successfully');
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to preview report', 'PREVIEW_FAILED', [], statusCode);
    }
  })
);
