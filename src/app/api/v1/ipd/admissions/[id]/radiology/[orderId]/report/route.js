import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { attachRadiologyReportSchema } from '@/validations/userValidation';

// POST /api/v1/ipd/admissions/:id/radiology/:orderId/report - Diagnostic staff attaches/finalizes report
export const POST = withErrorHandler(
  withRoles(['lab', 'doctor', 'clinic', 'admin'], async (req, { params }) => {
    const { id, orderId } = await params;
    if (!id || !orderId) {
      return ApiResponse.error('Admission ID and Order ID are required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId && req.user?.role !== 'lab') {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role !== 'lab' && req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const parsed = attachRadiologyReportSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => i.message);
      return ApiResponse.error(issues[0] || 'Validation error', 'VALIDATION_ERROR', issues, 400);
    }

    try {
      const order = await ipdService.attachRadiologyReport(clinicId, req.user, id, orderId, body);
      return ApiResponse.success({ order }, 'Radiology report attached and finalized successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PUT = POST;
export const PATCH = POST;
