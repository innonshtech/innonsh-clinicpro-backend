import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { requireIpdModule } from '@/utils/moduleGuard';
import { ipdService } from '@/services/ipdService';

export const GET = withErrorHandler(
  withRoles(['clinic', 'admin', 'doctor', 'nurse'], async (req, { params }) => {
    const { clinicId } = await params;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId !== clinicId) {
      return ApiResponse.error('Access Denied: You cannot access nurse records of another clinic.', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const moduleBlock = await requireIpdModule(clinicId);
    if (moduleBlock) return moduleBlock;

    const { searchParams } = new URL(req.url);
    const wardId = searchParams.get('wardId') || null;
    const status = searchParams.get('status') || null;

    try {
      const nurses = await ipdService.getNursesForWard(clinicId, wardId, status);
      return ApiResponse.success({ nurses }, 'Nurses fetched successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
