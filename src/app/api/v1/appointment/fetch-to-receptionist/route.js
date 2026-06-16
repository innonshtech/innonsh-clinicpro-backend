import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// POST: /api/v1/appointment/fetchtoreceptinist
/**
 * @swagger
 * /api/v1/appointment/fetchtoreceptinist:
 *   post:
 *     summary: POST request for /api/v1/appointment/fetchtoreceptinist
 *     tags: [Appointment]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function POST(req) {
  try {
    const { receptionistId } = await req.json();

    // Step 1: Get the receptionist
    const { data: receptionist, error: recError } = await supabase
      .from('staff')
      .select('clinic_id')
      .eq('id', receptionistId)
      .single();

    if (recError || !receptionist) {
      return ApiResponse.error("Receptionist not found", "NOT_FOUND", [], 404);
    }

    const clinicId = receptionist.clinic_id;

    // Step 2: Fetch appointments for the clinic
    const { data: appointmentsData, error: appError } = await supabase
      .from('appointments')
      .select('*')
      .eq('clinic_id', clinicId);

    if (appError) throw appError;

    const appointments = (appointmentsData || []).map(a => ({
      ...a,
      _id: a.id,
      appointmentDate: a.appointment_date,
      timeSlot: a.time_slot,
      time: a.time_slot,
      doctorId: a.doctor_id,
      patientId: a.patient_id,
      clinicId: a.clinic_id
    }));

    return ApiResponse.success({ appointments }, "Clinic appointments fetched successfully");
  } catch (error) {
    console.error("Error fetching clinic appointments:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
