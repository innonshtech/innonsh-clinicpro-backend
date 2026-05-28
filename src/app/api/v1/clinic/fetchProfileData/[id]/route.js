import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Clinic from '@/models/Clinic';

// GET clinic profile data by ID
/**
 * @swagger
 * /api/v1/clinic/fetchProfileData/{id}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetchProfileData/{id}
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

    const clinic = await Clinic.findById(id).select('-password');
    if (!clinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ clinic }, 'Clinic profile fetched successfully');
  } catch (error) {
    console.error('Fetch Clinic Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}