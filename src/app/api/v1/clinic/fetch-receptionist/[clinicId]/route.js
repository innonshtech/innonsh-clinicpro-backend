import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';

// GET: /api/v1/clinic/fetch-receptionist/[clinicId]
export const GET = withErrorHandler(
  withRoles(['clinic', 'admin'], async (req, { params }) => {
    const { clinicId } = await params;

    if (!clinicId) {
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    if (req.user?.role === 'clinic' && req.user?.clinicId && String(req.user.clinicId) !== String(clinicId)) {
      return ApiResponse.error('Forbidden: Cross-clinic access prohibited', 'CROSS_CLINIC_FORBIDDEN', [], 403);
    }

    const { data: staffList, error } = await supabase
      .from('staff')
      .select('*')
      .eq('clinic_id', clinicId);

    if (error) throw error;

    if (!staffList || staffList.length === 0) {
      return ApiResponse.success({ staff: [] }, 'No staff found for this clinic.');
    }

    const staff = staffList.map(s => ({
      ...s,
      _id: s.id,
      firstName: s.first_name,
      lastName: s.last_name,
      clinicId: s.clinic_id
    }));

    return ApiResponse.success({ staff }, 'Staff fetched successfully');
  })
);
