import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ipdService } from '@/services/ipdService';
import { consultingDoctorSchema } from '@/validations/userValidation';

export const POST = withErrorHandler(
  withRoles(['doctor', 'clinic', 'admin'], async (req, { params }) => {
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

    const parsed = consultingDoctorSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error('Validation failed', 'VALIDATION_ERROR', parsed.error.format(), 400);
    }

    try {
      const added = await ipdService.addConsultingDoctor(clinicId, req.user, id, parsed.data);
      return ApiResponse.success({ consultingDoctor: added }, 'Consulting doctor allocated successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message, err.code || 'ERROR', [], err.statusCode || 400);
    }
  })
);
