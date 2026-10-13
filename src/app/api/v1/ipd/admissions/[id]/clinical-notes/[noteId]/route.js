import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { clinicalNoteSchema } from '@/validations/userValidation';

// PUT / PATCH /api/v1/ipd/admissions/:id/clinical-notes/:noteId - Amend / Edit / Void note
export const PUT = withErrorHandler(
  withRoles(['doctor', 'admin', 'clinic'], async (req, { params }) => {
    const { id, noteId } = await params;
    if (!id || !noteId) {
      return ApiResponse.error('Admission ID and Note ID are required', 'MISSING_FIELD', [], 400);
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

    // If not a void operation, run clinicalNoteSchema validation
    if (!body.isVoided && body.action !== 'void') {
      const parsed = clinicalNoteSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error?.issues || parsed.error?.errors || [];
        const fieldErrors = issues.map(e => `${e.path.join('.') || 'note'}: ${e.message}`).join('; ');
        return ApiResponse.error(fieldErrors || 'Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
      }
    }

    try {
      const note = await ipdService.updateClinicalNote(clinicId, req.user, id, noteId, body);
      return ApiResponse.success({ note }, 'Clinical note updated successfully');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);

export const PATCH = PUT;

// DELETE /api/v1/ipd/admissions/:id/clinical-notes/:noteId - Mark clinical note as voided
export const DELETE = withErrorHandler(
  withRoles(['doctor', 'admin', 'clinic'], async (req, { params }) => {
    const { id, noteId } = await params;
    if (!id || !noteId) {
      return ApiResponse.error('Admission ID and Note ID are required', 'MISSING_FIELD', [], 400);
    }

    let body = {};
    try { body = await req.json(); } catch (e) {}

    const url = new URL(req.url);
    const clinicId = body.clinicId || url.searchParams.get('clinicId') || req.user?.clinicId;
    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.clinicId && clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const reason = (body.reason || body.voidReason || url.searchParams.get('reason') || '').trim();
    if (!reason) {
      return ApiResponse.error('A reason for voiding this clinical note is required', 'MISSING_VOID_REASON', [], 400);
    }

    try {
      const note = await ipdService.updateClinicalNote(clinicId, req.user, id, noteId, {
        isVoided: true,
        action: 'void',
        voidReason: reason
      });
      return ApiResponse.success({ note }, 'Clinical note marked as voided');
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
