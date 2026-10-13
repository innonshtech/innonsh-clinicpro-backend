import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { intakeOutputSchema } from '@/validations/userValidation';

// GET /api/v1/ipd/admissions/:id/intake-output - Read entries and daily balance summary
export const GET = withErrorHandler(
  withRoles(['nurse', 'doctor', 'clinic', 'admin'], async (req, { params }) => {
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

    const date = url.searchParams.get('date') || null;

    try {
      const result = await ipdService.getIntakeOutput(clinicId, req.user, id, date);
      return ApiResponse.success(result, 'Fluid intake/output records retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

// POST /api/v1/ipd/admissions/:id/intake-output - Record intake or output bedside entry
export const POST = withErrorHandler(
  withRoles(['nurse'], async (req, { params }) => {
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

    const parsed = intakeOutputSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      const fieldErrors = issues.map(e => `${e.path.join('.') || 'entry'}: ${e.message}`).join('; ');
      return ApiResponse.error(fieldErrors || 'Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    try {
      const entry = await ipdService.addIntakeOutput(clinicId, req.user, id, parsed.data);
      return ApiResponse.success({ entry }, 'Fluid intake/output entry recorded successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
