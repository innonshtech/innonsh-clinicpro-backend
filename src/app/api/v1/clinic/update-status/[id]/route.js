import { ApiResponse } from '@/utils/apiResponse';
import Clinic from '@/models/Clinic';
import dbConnect from '@/utils/db';

/**
 * @swagger
 * /api/v1/clinic/update-status/{id}:
 *   put:
 *     summary: PUT request for /api/v1/clinic/update-status/{id}
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
export async function PUT(req, { params }) {
  try {
    await dbConnect();
    const { id } = params;
    const { status, approved, rejectionReason } = await req.json();

    if (!id || !status) {
      return ApiResponse.error('ID and Status are required', 'MISSING_FIELD', [], 400);
    }

    const updateData = { status };

    if (approved !== undefined) {
      updateData.approved = approved;
    }

    if (rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const clinic = await Clinic.findByIdAndUpdate(id, updateData, { new: true });

    if (!clinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ clinic }, 'Status updated successfully');

  } catch (error) {
    console.error('Error updating clinic status:', error);
    return ApiResponse.error('Internal Server Error', 'SERVER_ERROR', error.message, 500);
  }
}