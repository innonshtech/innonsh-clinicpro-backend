import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Staff from '@/models/Staff';

// DELETE: /api/v1/clinic/delete-receptionist/[id]
/**
 * @swagger
 * /api/v1/clinic/delete-receptionist/{id}:
 *   delete:
 *     summary: DELETE request for /api/v1/clinic/delete-receptionist/{id}
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
export async function DELETE(req, { params }) {
  try {
    await dbConnect();
    const { id } = await params;

    if (!id) {
      return ApiResponse.error('Receptionist ID is required', 'MISSING_FIELD', [], 400);
    }

    const deletedStaff = await Staff.findByIdAndDelete(id);
    
    if (!deletedStaff) {
      return ApiResponse.error('Receptionist not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success(null, 'Receptionist deleted successfully');
  } catch (error) {
    console.error('Delete Receptionist Error:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}
