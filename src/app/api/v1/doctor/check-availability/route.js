// app/api/doctor/check-availability/route.js
import Appointment from "@/models/Appointments";
import dbConnect from "@/utils/db";
import { NextResponse } from "next/server";
import { ApiResponse } from "@/utils/apiResponse";

/**
 * @swagger
 * /api/v1/doctor/check-availability:
 *   post:
 *     summary: POST request for /api/v1/doctor/check-availability
 *     tags: [Doctor]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export async function POST(request) {
  await dbConnect();

  try {
    const { doctorId, date, time } = await request.json();

    if (!doctorId || !date || !time) {
      return ApiResponse.success(
        { error: 'Doctor ID, date and time are required' },
        {
          status: 400,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
          },
        }
      );
    }

    const existingAppointment = await Appointment.findOne({
      doctorId,
      appointmentDate: new Date(date),
      time,
      status: { $ne: 'cancelled' },
    });

    return ApiResponse.success(
      { isAvailable: !existingAppointment },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      }
    );

  } catch (error) {
    console.error('Error checking availability:', error);
    return ApiResponse.success(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
        },
      }
    );
  }
}

// Handle CORS Preflight (Optional but recommended)