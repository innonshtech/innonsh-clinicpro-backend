// /app/api/clinic/images/[clinicId]/route.js

import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Clinic from '@/models/Clinic';

// GET: /api/v1/clinic/fetch-images/[clinicId]
/**
 * @swagger
 * /api/v1/clinic/fetch-images/{clinicId}:
 *   get:
 *     summary: GET request for /api/v1/clinic/fetch-images/{clinicId}
 *     tags: [Clinic]
 *     parameters:
 *       - in: path
 *         name: clinicId
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
    const { clinicId } = params;

    const clinic = await Clinic.findById(clinicId).select('images');

    if (!clinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ images: clinic.images }, 'Images fetched successfully');
  } catch (error) {
    console.error('Error fetching clinic images:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}