import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Clinic from '@/models/Clinic';

/**
 * GET: Fetch all registered clinics
 */
/**
 * @swagger
 * /api/v1/clinic/fetch-all-clinics:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-all-clinics
 *     tags: [Clinic]
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

    const clinics = await Clinic.find().select('-password');

    return ApiResponse.success({ clinics }, 'Clinics fetched successfully');
  } catch (error) {
    console.error('Error fetching clinics:', error);
    return ApiResponse.error('Failed to fetch clinics', 'SERVER_ERROR', error.message, 500);
  }
}