import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { ipdAdmissionSchema } from '@/validations/userValidation';

// POST: /api/v1/ipd/admissions — Strictly Doctor-only admission
export const POST = withErrorHandler(
  withRoles(['doctor'], async (req) => {
    let body;
    try { body = await req.json(); } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    // Strict doctor authentication check
    if (!req.user || req.user.role !== 'doctor') {
      return ApiResponse.error('Forbidden: Only authenticated doctors can admit patients.', 'FORBIDDEN', [], 403);
    }

    const clinicId = req.user.clinicId || body.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    // Tenant isolation: if doctor's token specifies clinicId and body specifies another clinicId, reject
    if (req.user.clinicId && body.clinicId && req.user.clinicId !== body.clinicId) {
      return ApiResponse.error('Forbidden: Cross-clinic admission attempt.', 'FORBIDDEN', [], 403);
    }

    const parsed = ipdAdmissionSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error('Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    try {
      const admission = await ipdService.admitPatient(clinicId, req.user, {
        ...parsed.data,
        admittingDoctorId: req.user.id
      });
      return ApiResponse.success({ admission }, 'Inpatient admitted successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ADMISSION_FAILED', [], err.statusCode || 400);
    }
  })
);

export const GET = withErrorHandler(
  withRoles(['doctor', 'clinic', 'admin', 'nurse'], async (req) => {
    const { searchParams } = new URL(req.url);
    const clinicId = searchParams.get('clinicId') || req.user?.clinicId;
    const status = searchParams.get('status') || null;
    const scope = searchParams.get('scope') || null;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    try {
      const admissions = await ipdService.getAdmissions(clinicId, req.user, { status, scope });
      return ApiResponse.success({ admissions }, 'Admissions retrieved successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
