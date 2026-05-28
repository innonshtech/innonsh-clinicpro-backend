import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import Doctor from '@/models/Doctor';
import Patient from '@/models/Patient';
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
      await dbConnect();
      const { id } = params; // this is the doctorId

      // 1. Fetch all appointments for this doctor
      const appointments = await Appointment.find({ doctorId: id });

      // 2. Enrich each appointment with doctor + patient details
      const enrichedAppointments = await Promise.all(
        appointments.map(async (appt) => {
          const doctor = await Doctor.findById(appt.doctorId).select("-password");
          const patient = await Patient.findById(appt.patientId).select("-password");

          return {
            ...appt.toObject(),
            patientId: appt.patientId ? appt.patientId.toString() : null,
            doctorDetails: doctor || null,
            patientDetails: patient || null,
          };
        })
      );

      return ApiResponse.success({ appointments: enrichedAppointments }, "Appointments fetched successfully");
    } catch (error) {
      console.error('Error fetching appointments with doctor/patient data:', error);
      return ApiResponse.error('Failed to fetch data', 'SERVER_ERROR', error.message, 500);
    }
  })
);