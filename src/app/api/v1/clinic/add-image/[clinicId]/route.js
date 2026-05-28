import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Clinic from '@/models/Clinic';

/**
 * PATCH: Add an image URL to a clinic's image list
 */
/**
 * @swagger
 * /api/v1/clinic/add-image/{clinicId}:
 *   patch:
 *     summary: PATCH request for /api/v1/clinic/add-image/{clinicId}
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
export async function PATCH(req, { params }) {
  try {
    await dbConnect();
    const { clinicId } = params;
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return ApiResponse.error('Image URL is required', 'MISSING_FIELD', [], 400);
    }

    const updatedClinic = await Clinic.findByIdAndUpdate(
      clinicId,
      { $push: { images: imageUrl } },
      { new: true }
    );

    if (!updatedClinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ images: updatedClinic.images }, 'Image added successfully');
  } catch (error) {
    console.error('Error adding image to clinic:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}