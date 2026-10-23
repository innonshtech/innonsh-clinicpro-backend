import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { createRadiologyOrderSchema } from '@/validations/userValidation';

// GET /api/v1/ipd/admissions/:id/radiology - Read admission radiology orders & reports
export const GET = withErrorHandler(
  withRoles(['doctor', 'nurse', 'lab', 'clinic', 'admin'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Admission ID is required', 'MISSING_FIELD', [], 400);
    }

    const url = new URL(req.url);
    const clinicId = url.searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    try {
      const orders = await ipdService.getAdmissionRadiologyOrders(clinicId, req.user, id);
      return ApiResponse.success({ orders }, 'Radiology orders retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

// POST /api/v1/ipd/admissions/:id/radiology - Doctor orders radiology investigation
export const POST = withErrorHandler(
  withRoles(['doctor', 'clinic', 'admin'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Admission ID is required', 'MISSING_FIELD', [], 400);
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

    const parsed = createRadiologyOrderSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error.issues.map(i => i.message);
      return ApiResponse.error(issues[0] || 'Validation error', 'VALIDATION_ERROR', issues, 400);
    }

    try {
      const order = await ipdService.createRadiologyOrder(clinicId, req.user, id, body);
      return ApiResponse.success({ order }, 'Radiology investigation ordered successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
