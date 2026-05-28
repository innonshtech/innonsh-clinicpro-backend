import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import Doctor from '@/models/Doctor';
import Leave from '@/models/Leave';
import dbConnect from '@/utils/db';

// GET all doctors
/**
 * @swagger
 * /api/v1/doctor/fetchAll:
 *   get:
 *     summary: GET request for /api/v1/doctor/fetchAll
 *     tags: [Doctor]
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

    const doctors = await Doctor.find(); // Fetch all doctors

    // Check leaves for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enrichedDoctors = await Promise.all(
      doctors.map(async (doc) => {
        const docObj = doc.toObject();
        const leaveRecord = await Leave.findOne({
          doctorId: doc._id,
          date: today
        });
        docObj.isOnLeave = !!leaveRecord;
        return docObj;
      })
    );

    return ApiResponse.success({ doctors: enrichedDoctors });
  } catch (error) {
    console.error('❌ Error fetching doctors:', error);
    return ApiResponse.error(
      'Internal Server Error', 
      'FETCH_ALL_ERROR', 
      error.message, 
      500
    );
  }
}