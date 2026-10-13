import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { intakeOutputUpdateSchema } from '@/validations/userValidation';

// PATCH /api/v1/ipd/admissions/:id/intake-output/:entryId - Void or correct entry
export const PATCH = withErrorHandler(
  withRoles(['nurse', 'clinic', 'admin'], async (req, { params }) => {
    const { id, entryId } = await params;
    if (!id || !entryId) {
      return ApiResponse.error('Admission ID and Entry ID are required', 'MISSING_FIELD', [], 400);
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

    const parsed = intakeOutputUpdateSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      const fieldErrors = issues.map(e => `${e.path.join('.') || 'entry'}: ${e.message}`).join('; ');
      return ApiResponse.error(fieldErrors || 'Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    try {
      const entry = await ipdService.updateIntakeOutput(clinicId, req.user, id, entryId, parsed.data);
      return ApiResponse.success({ entry }, 'Fluid record updated successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PUT = PATCH;
