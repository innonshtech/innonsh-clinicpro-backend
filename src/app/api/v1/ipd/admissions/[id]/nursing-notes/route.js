import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { nursingNoteSchema } from '@/validations/userValidation';

// GET /api/v1/ipd/admissions/:id/nursing-notes - Read chronological nursing notes
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

    try {
      const notes = await ipdService.getNursingNotes(clinicId, req.user, id);
      return ApiResponse.success({ notes }, 'Nursing notes retrieved successfully', 200);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

// POST /api/v1/ipd/admissions/:id/nursing-notes - Record new nursing note
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

    const parsed = nursingNoteSchema.safeParse(body);
    if (!parsed.success) {
      const issues = parsed.error?.issues || parsed.error?.errors || [];
      const fieldErrors = issues.map(e => `${e.path.join('.') || 'note'}: ${e.message}`).join('; ');
      return ApiResponse.error(fieldErrors || 'Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    try {
      const note = await ipdService.addNursingNote(clinicId, req.user, id, parsed.data);
      return ApiResponse.success({ note }, 'Nursing note recorded successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
