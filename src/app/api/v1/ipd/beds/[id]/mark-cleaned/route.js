import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

export const POST = withErrorHandler(
  withRoles(['housekeeping', 'clinic', 'admin', 'nurse'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Bed ID is required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (e) {}

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    try {
      const result = await ipdService.markBedCleaned(clinicId, req.user, id, body);
      return ApiResponse.success({ result }, result.message);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'CLEANING_FAILED', [], err.statusCode || 400);
    }
  })
);
