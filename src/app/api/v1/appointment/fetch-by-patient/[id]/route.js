import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET: /api/v1/appointment/fetch-by-patient/[id]
/**
 * @swagger
 * /api/v1/appointment/fetch-by-patient/{id}:
 *   get:
 *     summary: GET request for /api/v1/appointment/fetch-by-patient/{id}
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
export async function GET(req, { params }) {
  try {
    const { id } = await params;

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('*, doctors:doctor_id (*)')
      .eq('patient_id', id);

    if (error) throw error;

    const enrichedAppointments = (appointments || []).map(appt => {
      const { doctors, ...rest } = appt;
      
      const doctorDetails = doctors ? {
        ...doctors,
        _id: doctors.id,
        firstName: doctors.first_name,
        lastName: doctors.last_name,
      } : null;

      if (doctorDetails) {
        delete doctorDetails.password;
      }

      return {
        ...rest,
        _id: rest.id,
        patientId: rest.patient_id,
        doctorId: rest.doctor_id,
        clinicId: rest.clinic_id,
        appointmentDate: rest.appointment_date,
        timeSlot: rest.time_slot,
        doctorDetails
      };
    });

    return ApiResponse.success({ appointments: enrichedAppointments }, "Patient appointments fetched successfully");
  } catch (error) {
    console.error('Error fetching appointments with doctor data:', error);
    return ApiResponse.error('Failed to fetch appointments', 'SERVER_ERROR', error.message, 500);
  }
}