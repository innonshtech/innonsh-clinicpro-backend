import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET /api/v1/visit/list
export const GET = withErrorHandler(
  withRoles(['doctor', 'admin', 'receptionist'], async (req) => {
    const { searchParams } = new URL(req.url);
    const appointmentId = searchParams.get('appointmentId');

    let query = supabase.from('visits').select(`
      *,
      patients:patient_id (id, first_name, last_name, date_of_birth, gender, patient_code)
    `).order('created_at', { ascending: false });

    if (appointmentId) {
      const { data: appointment, error: apptError } = await supabase
        .from('appointments')
        .select('clinic_id')
        .eq('id', appointmentId)
        .maybeSingle();
      
      if (apptError || !appointment) {
        return ApiResponse.error('Appointment not found', 'NOT_FOUND', [], 404);
      }
      
      if (req.user.clinicId && String(appointment.clinic_id) !== String(req.user.clinicId)) {
        return ApiResponse.error('Access Denied', 'FORBIDDEN', [], 403);
      }
      
      query = query.eq('appointment_id', appointmentId);
    } else if (req.user.role === 'doctor') {
      query = query.eq('doctor_id', req.user.id);
    } else {
      return ApiResponse.error('appointmentId parameter is required', 'VALIDATION_ERROR', [], 400);
    }

    const { data: visitsData, error: visitsError } = await query;
    if (visitsError) throw visitsError;

    const visits = (visitsData || []).map(v => ({
      ...v,
      _id: v.id,
      appointmentId: v.appointment_id,
      patientId: v.patients ? {
         _id: v.patients.id,
         firstName: v.patients.first_name,
         lastName: v.patients.last_name,
         dateOfBirth: v.patients.date_of_birth,
         gender: v.patients.gender,
         patientCode: v.patients.patient_code
      } : v.patient_id
    }));

    return ApiResponse.success({ visits }, "Visits fetched successfully");
  })
);
