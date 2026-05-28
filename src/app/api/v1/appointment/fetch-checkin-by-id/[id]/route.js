import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import Doctor from '@/models/Doctor';

// OPTIONS for CORS
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}

// GET /api/appointment/fetch-checkin-with-medicines/[patientId]
/**
 * @swagger
 * /api/v1/appointment/fetch-checkin-by-id/{id}:
 *   get:
 *     summary: GET request for /api/v1/appointment/fetch-checkin-by-id/{id}
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
  await dbConnect();

  const { id } = params;

  try {
    const appointments = await Appointment.find({
      patientId:id,
      medicines: { $exists: true, $ne: [] }
    });

    const appointmentsWithDoctor = await Promise.all(
      appointments.map(async (appointment) => {
        const doctor = await Doctor.findById(appointment.doctorId).lean();
        return {
          ...appointment.toObject(),
          doctorDetails: doctor || null,
        };
      })
    );

    const response = ApiResponse.success({
      success: true,
      data: appointmentsWithDoctor,
    });
    return response;
  } catch (error) {
    const response = ApiResponse.success({
      success: false,
      error: error.message,
    }, { status: 500 });
    return response;
  }
}