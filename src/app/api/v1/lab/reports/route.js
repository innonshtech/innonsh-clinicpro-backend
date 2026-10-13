import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labReportService } from '@/services/labReportService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/reports
 * List diagnostic reports scoped strictly to authenticated laboratory.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VIEW_REPORTS)) {
      return ApiResponse.error('Access Denied: You do not have permission to view diagnostic reports.', 'FORBIDDEN', [], 403);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const patientId = searchParams.get('patientId') || null;
    const orderId = searchParams.get('orderId') || null;
    const sampleId = searchParams.get('sampleId') || null;
    const status = searchParams.get('status') || 'all';

    const reports = await labReportService.listReports(labId, {
      search,
      patientId,
      orderId,
      sampleId,
      status
    });

    return ApiResponse.success({ reports, count: reports.length }, 'Diagnostic reports retrieved successfully');
  })
);
