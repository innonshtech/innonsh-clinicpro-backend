import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

// GET /api/v1/ipd/radiology/orders - Diagnostic staff listing across admissions
export const GET = withErrorHandler(
  withRoles(['lab', 'doctor', 'clinic', 'admin'], async (req) => {
    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId && req.user?.role !== 'lab') {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role !== 'lab' && req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const query = {
      status: url.searchParams.get('status'),
      admissionId: url.searchParams.get('admissionId') || url.searchParams.get('admission_id'),
      patientId: url.searchParams.get('patientId') || url.searchParams.get('patient_id'),
      investigationType: url.searchParams.get('investigationType') || url.searchParams.get('investigation_type')
    };

    try {
      const orders = await ipdService.getRadiologyOrders(clinicId, req.user, query);
      return ApiResponse.success({ orders }, 'Radiology orders retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
