import { NextResponse } from 'next/server';
import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

// Handle DELETE doctor by ID
/**
 * @swagger
 * /api/v1/doctor/delete-by-id/{id}:
 *   delete:
 *     summary: DELETE request for /api/v1/doctor/delete-by-id/{id}
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
export async function DELETE(req, { params }) {
  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    const { data: deletedDoctor, error } = await supabase
      .from('doctors')
      .delete()
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!deletedDoctor) {
      return ApiResponse.error('Doctor not found', 'USER_NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ id }, 'Doctor deleted successfully');
  } catch (error) {
    console.error('Error deleting doctor:', error);
    return ApiResponse.error('Internal Server Error', 'SERVER_ERROR', error.message, 500);
  }
}