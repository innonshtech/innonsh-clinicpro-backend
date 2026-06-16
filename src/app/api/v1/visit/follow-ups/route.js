import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withRoles } from '@/utils/authGuard';

/**
 * GET /api/v1/visit/follow-ups
 * Fetches all visits that have a follow-up date set for the current clinic.
 */
export const GET = withRoles(['receptionist', 'admin', 'doctor'], async (req) => {
    try {
        const { clinicId } = req.user;

        if (!clinicId) {
            return ApiResponse.error('Clinic ID not found in session', 'FORBIDDEN', [], 403);
        }

        const { data: visits, error } = await supabase
            .from('visits')
            .select(`
                *,
                patients (id, first_name, last_name, patient_code, phone),
                doctors (id, first_name, last_name, specialty)
            `)
            .eq('clinic_id', clinicId)
            .not('follow_up_date', 'is', null)
            .order('follow_up_date', { ascending: true });

        if (error) throw error;

        // Clean up the joined data to match the expected frontend format
        const formattedVisits = (visits || []).map(v => ({
            ...v,
            _id: v.id,
            patientId: v.patients ? {
                _id: v.patients.id,
                firstName: v.patients.first_name,
                lastName: v.patients.last_name,
                patientId: v.patients.patient_code, // patientId is called patient_code in supabase
                phoneNumber: v.patients.phone
            } : { firstName: 'Unknown', lastName: 'Patient' },
            doctorId: v.doctors ? {
                _id: v.doctors.id,
                firstName: v.doctors.first_name,
                lastName: v.doctors.last_name,
                specialty: v.doctors.specialty
            } : { firstName: 'Unknown', lastName: 'Doctor' }
        }));

        return ApiResponse.success(formattedVisits, "Follow-up list fetched successfully");
    } catch (error) {
        console.error('Error fetching follow-ups:', error);
        return ApiResponse.error(error.message || 'Internal Server Error', 'SERVER_ERROR', [], 500);
    }
});
