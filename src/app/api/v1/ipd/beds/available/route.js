import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

export const GET = withErrorHandler(
  withRoles(['doctor', 'clinic', 'admin'], async (req) => {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;
    const wardId = searchParams.get('wardId') || null;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    try {
      const beds = await ipdService.getAvailableBeds(clinicId, wardId);
      return ApiResponse.success({ beds }, 'Available beds fetched successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
