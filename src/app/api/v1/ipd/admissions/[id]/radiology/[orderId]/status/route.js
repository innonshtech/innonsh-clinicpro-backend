import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

// PATCH /api/v1/ipd/admissions/:id/radiology/:orderId/status
export const PATCH = withErrorHandler(
  withRoles(['doctor', 'lab', 'clinic', 'admin'], async (req, { params }) => {
    const { id, orderId } = await params;
    if (!id || !orderId) {
      return ApiResponse.error('Admission ID and Order ID are required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId && req.user?.role !== 'lab') {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    try {
      const updated = await ipdService.updateRadiologyOrderStatus(clinicId, req.user, id, orderId, body);
      return ApiResponse.success({ order: updated }, 'Radiology order status updated successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PUT = PATCH;
