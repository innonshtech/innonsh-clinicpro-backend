import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET: /api/v1/appointment/fetch-checkin
/**
 * @swagger
 * /api/v1/appointment/fetch-checkin:
 *   get:
 *     summary: GET request for /api/v1/appointment/fetch-checkin
 *     tags: [Appointment]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function GET() {
  try {
    const { data: appointmentsData, error } = await supabase
      .from('appointments')
      .select(`
        *,
        doctors (id, first_name, last_name, specialty, email, phone, clinic_id)
      `)
      .not('medicines', 'is', null);

    if (error) throw error;

    // Filter where medicines is an array and not empty
    const appointments = (appointmentsData || []).filter(
      (a) => Array.isArray(a.medicines) && a.medicines.length > 0
    );

    // Map to match original mongoose output
    const appointmentsWithDoctor = appointments.map((appointment) => {
      return {
        ...appointment,
        _id: appointment.id,
        appointmentDate: appointment.appointment_date,
        timeSlot: appointment.time_slot,
        doctorDetails: appointment.doctors ? { ...appointment.doctors, _id: appointment.doctors.id } : null
      };
    });

    return ApiResponse.success({ appointments: appointmentsWithDoctor }, "Checked-in appointments fetched successfully");
  } catch (error) {
    console.error('Error fetching checked-in appointments:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}