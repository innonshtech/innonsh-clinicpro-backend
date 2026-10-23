import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

export const GET = withErrorHandler(
  withRoles(['clinic', 'admin', 'doctor', 'nurse', 'housekeeping'], async (req, { params }) => {
    const { id } = await params;
    if (!id) return ApiResponse.error('Bed ID is required', 'MISSING_FIELD', [], 400);

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId) return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    try {
      const details = await ipdService.getBedDetails(clinicId, id);
      return ApiResponse.success(details, 'Bed details and history fetched successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PUT = withErrorHandler(
  withRoles(['clinic', 'admin', 'doctor', 'housekeeping', 'nurse'], async (req, { params }) => {
    const { id } = await params;
    if (!id) return ApiResponse.error('Bed ID is required', 'MISSING_FIELD', [], 400);

    let body = {};
    try { body = await req.json(); } catch (e) {}
    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'FORBIDDEN', [], 403);
    }

    try {
      const result = await ipdService.updateBedStatus(clinicId, req.user, id, body);
      return ApiResponse.success({ result }, result.message);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'UPDATE_FAILED', [], err.statusCode || 400);
    }
  })
);
