import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labReportService } from '@/services/labReportService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * POST /api/v1/lab/reports/generate
 * Issue and persist a diagnostic report from validated results.
 * Idempotent: Returns existing issued report on repeated clicks / refresh.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.ISSUE_REPORTS)) {
      return ApiResponse.error('Access Denied: Only Pathologists or Lab Directors are authorized to issue final diagnostic reports.', 'FORBIDDEN', [], 403);
    }

    const body = await req.json().catch(() => ({}));
    const { order_id, sample_id } = body;

    if (!order_id && !sample_id) {
      return ApiResponse.error('order_id or sample_id is required for report generation', 'BAD_REQUEST', [], 400);
    }

    try {
      const result = await labReportService.generateReport(labId, { orderId: order_id, sampleId: sample_id }, req.user);

      const message = result.already_issued
        ? 'Existing diagnostic report retrieved (idempotent)'
        : 'Diagnostic report issued successfully';

      return ApiResponse.success(result, message, result.already_issued ? 200 : 201);
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to issue diagnostic report', 'REPORT_GENERATION_FAILED', [], statusCode);
    }
  })
);
