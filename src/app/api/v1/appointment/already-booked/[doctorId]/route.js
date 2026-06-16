import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// GET: /api/v1/appointment/already-booked/[doctorId]
/**
 * @swagger
 * /api/v1/appointment/already-booked/{doctorId}:
 *   get:
 *     summary: GET request for /api/v1/appointment/already-booked/{doctorId}
 *     tags: [Appointment]
 *     parameters:
 *       - in: path
 *         name: doctorId
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
    const { doctorId } = await params;

    if (!doctorId) {
      return ApiResponse.error("Doctor ID is required", "MISSING_FIELD", [], 400);
    }

    const { data: appointments, error } = await supabase
      .from('appointments')
      .select('appointment_date, time_slot')
      .eq('doctor_id', doctorId)
      .not('status', 'eq', 'cancelled');

    if (error) throw error;

    // Group booked slots by date
    const bookedSlots = {};
    (appointments || []).forEach((appointment) => {
      // Use original timeSlot mapping
      const date = appointment.appointment_date;
      const time = appointment.time_slot;

      if (!bookedSlots[date]) {
        bookedSlots[date] = [];
      }
      bookedSlots[date].push(time);
    });

    return ApiResponse.success({ slots: bookedSlots }, "Booked slots fetched successfully");
  } catch (error) {
    console.error("Error fetching booked slots:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}