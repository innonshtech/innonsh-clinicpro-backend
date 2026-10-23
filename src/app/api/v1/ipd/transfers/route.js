import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

// GET /api/v1/ipd/transfers - List transfers across clinic
export const GET = withErrorHandler(
  withRoles(['doctor', 'nurse', 'clinic', 'admin'], async (req) => {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const status = searchParams.get('status') || undefined;
    try {
      const transfers = await ipdService.getClinicTransfers(clinicId, req.user, { status });
      return ApiResponse.success({ transfers }, 'Clinic transfers retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
