import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Doctor from '@/models/Doctor';

// GET doctors by clinic ID
/**
 * @swagger
 * /api/v1/clinic/fetch-doctor-clinicId/{id}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-doctor-clinicId/{id}
 *     tags: [Clinic]
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
      return ApiResponse.error('Clinic ID is required', 'MISSING_FIELD', [], 400);
    }

    const doctors = await Doctor.find({ clinicId: id }).select('-password');
    
    return ApiResponse.success({ doctors }, 'Doctors fetched successfully');
  } catch (error) {
    console.error('Fetch Doctors by Clinic Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}
