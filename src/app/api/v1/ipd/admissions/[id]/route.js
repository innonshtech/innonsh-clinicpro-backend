import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

export const PUT = withErrorHandler(
  withRoles(['doctor', 'clinic', 'admin'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Admission ID is required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (e) {}

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    try {
      const result = await ipdService.dischargePatient(clinicId, req.user, id, body);
      return ApiResponse.success({ result, billing: result.billing }, 'Patient discharged successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'DISCHARGE_FAILED', [], err.statusCode || 400);
    }
  })
);

export const GET = withErrorHandler(
  withRoles(['doctor', 'clinic', 'admin', 'nurse'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Admission ID is required', 'MISSING_FIELD', [], 400);
    }

    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && req.user.clinicId !== clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic access denied.', 'FORBIDDEN', [], 403);
    }

    try {
      const admission = await ipdService.getAdmissionById(clinicId, req.user, id);
      return ApiResponse.success({ admission }, 'Inpatient admission retrieved successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
