import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import Doctor from '@/models/Doctor';

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
    await dbConnect();

    const appointments = await Appointment.find({
      medicines: { $exists: true, $ne: [] }
    });

    // Manually add doctor details to each appointment
    const appointmentsWithDoctor = await Promise.all(
      appointments.map(async (appointment) => {
        const doctor = await Doctor.findById(appointment.doctorId).select("-password").lean();
        return {
          ...appointment.toObject(),
          doctorDetails: doctor || null
        };
      })
    );

    return ApiResponse.success({ appointments: appointmentsWithDoctor }, "Checked-in appointments fetched successfully");
  } catch (error) {
    console.error('Error fetching clinic images:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}