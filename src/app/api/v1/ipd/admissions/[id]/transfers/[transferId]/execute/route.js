import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

// POST /api/v1/ipd/admissions/:id/transfers/:transferId/execute - Nurse executes approved transfer
export const POST = withErrorHandler(
  withRoles(['nurse', 'clinic', 'admin'], async (req, { params }) => {
    const { id, transferId } = await params;
    if (!id || !transferId) {
      return ApiResponse.error('Admission ID and Transfer ID are required', 'MISSING_FIELD', [], 400);
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

    try {
      const result = await ipdService.executePatientTransfer(clinicId, req.user, id, transferId, body);
      return ApiResponse.success(result, 'Patient transfer executed successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
