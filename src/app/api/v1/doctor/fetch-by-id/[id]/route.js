import { ApiResponse } from '@/utils/apiResponse';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';

// GET doctor by ID
/**
 * @swagger
 * /api/v1/doctor/fetch-by-id/{id}:
 *   get:
 *     summary: GET request for /api/v1/doctor/fetch-by-id/{id}
 *     tags: [Doctor]
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
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Doctor ID is required', 'MISSING_FIELD', [], 400);
    }

    const doctor = await Doctor.findById(id).select("-password");
    if (!doctor) {
      return ApiResponse.error('Doctor not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ doctor }, 'Doctor fetched successfully');
  } catch (error) {
    console.error('Error fetching doctor:', error);
    return ApiResponse.error('Internal Server Error', 'SERVER_ERROR', error.message, 500);
  }
}
