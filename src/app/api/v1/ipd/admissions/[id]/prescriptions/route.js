import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { ipdPrescriptionSchema } from '@/validations/userValidation';

// GET /api/v1/ipd/admissions/:id/prescriptions - Read active inpatient prescriptions
export const GET = withErrorHandler(
  withRoles(['doctor', 'nurse', 'clinic', 'admin'], async (req, { params }) => {
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
      const prescriptions = await ipdService.getIpdPrescriptions(clinicId, req.user, id);
      return ApiResponse.success({ prescriptions }, 'Inpatient prescriptions retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

// POST /api/v1/ipd/admissions/:id/prescriptions - Doctor orders new inpatient medication
export const POST = withErrorHandler(
  withRoles(['doctor'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Admission ID is required', 'MISSING_FIELD', [], 400);
    }

    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const parsed = ipdPrescriptionSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      const fieldErrors = issues.map(e => `${e.path.join('.') || 'prescription'}: ${e.message}`).join('; ');
      return ApiResponse.error(fieldErrors || 'Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    try {
      const prescription = await ipdService.createIpdPrescription(clinicId, req.user, id, parsed.data);
      return ApiResponse.success({ prescription }, 'Inpatient prescription created successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);


// PATCH /api/v1/ipd/admissions/:id/prescriptions - Doctor discontinues an inpatient medication
export const PATCH = withErrorHandler(
  withRoles(['doctor'], async (req, { params }) => {
    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Admission ID is required', 'MISSING_FIELD', [], 400);
    }

    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    const clinicId = body.clinicId || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const presId = body.prescriptionId || body.prescription_id;
    if (!presId) {
      return ApiResponse.error('Prescription ID is required', 'PRESCRIPTION_ID_REQUIRED', [], 400);
    }

    const reason = (body.reason || body.discontinuation_reason || '').trim();
    if (!reason || reason.length < 3) {
      return ApiResponse.error('A mandatory clinical reason is required to discontinue medication (minimum 3 characters).', 'DISCONTINUATION_REASON_REQUIRED', [], 400);
    }

    try {
      const prescription = await ipdService.discontinueIpdPrescription(clinicId, req.user, id, presId, body);
      return ApiResponse.success({ prescription }, 'Inpatient prescription discontinued successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
