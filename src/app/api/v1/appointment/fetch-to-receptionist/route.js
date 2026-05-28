import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import Receptionist from '@/models/Staff';
import Doctor from '@/models/Doctor';

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
    await dbConnect();
    const { receptionistId } = await req.json();

    // Step 1: Get the receptionist
    const receptionist = await Receptionist.findById(receptionistId);
    if (!receptionist) {
      return ApiResponse.error("Receptionist not found", "NOT_FOUND", [], 404);
    }

    const clinicId = receptionist.clinicId;

    // Step 2: Find all doctors in that clinic
    const doctors = await Doctor.find({ clinicId });
    const doctorIds = doctors.map((doc) => doc._id.toString());

    if (doctorIds.length === 0) {
      return ApiResponse.error("No doctors found for this clinic", "NOT_FOUND", [], 404);
    }

    // Step 3: Fetch appointments for all those doctors
    const appointments = await Appointment.find({
      doctorId: { $in: doctorIds }
    });

    return ApiResponse.success({ appointments }, "Clinic appointments fetched successfully");
  } catch (error) {
    console.error("Error fetching clinic appointments:", error);
    return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
  }
}
