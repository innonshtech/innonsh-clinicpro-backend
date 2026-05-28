import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';

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
    await dbConnect();
    const { doctorId } = params;

    if (!doctorId) {
      return ApiResponse.error("Doctor ID is required", "MISSING_FIELD", [], 400);
    }

    const appointments = await Appointment.find({ doctorId });

    // Group booked slots by date
    const bookedSlots = {};
    appointments.forEach((appointment) => {
      const date = appointment.appointmentDate;
      const time = appointment.time;

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