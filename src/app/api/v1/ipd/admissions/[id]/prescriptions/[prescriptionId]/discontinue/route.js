import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

// POST /api/v1/ipd/admissions/:id/prescriptions/:prescriptionId/discontinue
export const POST = withErrorHandler(
  withRoles(['doctor'], async (req, { params }) => {
    const { id, prescriptionId } = await params;
    if (!id || !prescriptionId) {
      return ApiResponse.error('Admission ID and Prescription ID are required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const reason = (body.reason || body.discontinuation_reason || '').trim();
    if (!reason || reason.length < 3) {
      return ApiResponse.error('A mandatory clinical reason is required to discontinue medication (minimum 3 characters).', 'DISCONTINUATION_REASON_REQUIRED', [], 400);
    }

    try {
      const prescription = await ipdService.discontinueIpdPrescription(clinicId, req.user, id, prescriptionId, body);
      return ApiResponse.success({ prescription }, 'Inpatient prescription discontinued successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PATCH = POST;
