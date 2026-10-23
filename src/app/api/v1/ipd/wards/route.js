import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

export const GET = withErrorHandler(
  withRoles(['clinic', 'admin', 'doctor', 'nurse'], async (req) => {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    try {
      const wards = await ipdService.getWards(clinicId, req.user);
      return ApiResponse.success({ wards }, 'Wards fetched successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
