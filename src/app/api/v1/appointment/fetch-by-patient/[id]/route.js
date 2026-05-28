import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import Doctor from '@/models/Doctor';

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
    await dbConnect();
    const { id } = params;

    // 1. Find all appointments for the patient
    const appointments = await Appointment.find({ patientId: id });

    // 2. Populate each appointment with corresponding doctor data
    const enrichedAppointments = await Promise.all(
      appointments.map(async (appt) => {
        const doctor = await Doctor.findById(appt.doctorId).select("-password");
        return {
          ...appt.toObject(),
          doctorDetails: doctor || null,
        };
      })
    );

    return ApiResponse.success({ appointments: enrichedAppointments }, "Patient appointments fetched successfully");
  } catch (error) {
    console.error('Error fetching appointments with doctor data:', error);
    return ApiResponse.error('Failed to fetch appointments', 'SERVER_ERROR', error.message, 500);
  }
}