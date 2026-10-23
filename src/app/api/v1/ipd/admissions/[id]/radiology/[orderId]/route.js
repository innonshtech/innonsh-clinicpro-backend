import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';

// GET /api/v1/ipd/admissions/:id/radiology/:orderId
export const GET = withErrorHandler(
  withRoles(['doctor', 'nurse', 'lab', 'clinic', 'admin'], async (req, { params }) => {
    const { id, orderId } = await params;
    if (!id || !orderId) {
      return ApiResponse.error('Admission ID and Order ID are required', 'MISSING_FIELD', [], 400);
    }

    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    try {
      const orders = await ipdService.getAdmissionRadiologyOrders(clinicId, req.user, id);
      const order = orders.find(o => o.id === orderId || o._id === orderId);
      if (!order) {
        return ApiResponse.error('Radiology order not found', 'ORDER_NOT_FOUND', [], 404);
      }
      return ApiResponse.success({ order }, 'Radiology order retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

// PATCH /api/v1/ipd/admissions/:id/radiology/:orderId - Update order status
export const PATCH = withErrorHandler(
  withRoles(['doctor', 'lab', 'clinic', 'admin'], async (req, { params }) => {
    const { id, orderId } = await params;
    if (!id || !orderId) {
      return ApiResponse.error('Admission ID and Order ID are required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (_) {}

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
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
