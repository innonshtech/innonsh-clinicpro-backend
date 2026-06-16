import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import { withRoles } from '@/utils/authGuard';
import { withErrorHandler } from '@/utils/apiHandler';

// GET: /api/v1/appointment/fetchbydoctor/[id]
/**
 * @swagger
 * /api/v1/appointment/fetchbydoctor/{id}:
 *   get:
 *     summary: GET request for /api/v1/appointment/fetchbydoctor/{id}
 *     tags: [Appointment]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export const GET = withErrorHandler(
  withRoles(['doctor', 'admin'], async (req, { params }) => {
    try {
      const { id } = await params; // this is the doctorId

      // 1. Fetch appointments + joined doctors & patients
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          *,
          doctors (id, first_name, last_name, specialty, email, phone, clinic_id),
          patients (id, first_name, last_name, email, phone, gender, dob)
        `)
        .eq('doctor_id', id);

      if (error) throw error;

      // 2. Format to match original mongoose output
      const enrichedAppointments = (appointments || []).map((appt) => {
        return {
          ...appt,
          _id: appt.id,
          patientId: appt.patient_id ? String(appt.patient_id) : null,
          appointmentDate: appt.appointment_date,
          timeSlot: appt.time_slot,
          doctorDetails: appt.doctors ? { ...appt.doctors, _id: appt.doctors.id } : null,
          patientDetails: appt.patients ? { ...appt.patients, _id: appt.patients.id } : null,
        };
      });

      return ApiResponse.success({ appointments: enrichedAppointments }, "Appointments fetched successfully");
    } catch (error) {
      console.error('Error fetching appointments with doctor/patient data:', error);
      return ApiResponse.error('Failed to fetch data', 'SERVER_ERROR', error.message, 500);
    }
  })
);