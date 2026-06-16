// /app/api/clinic/images/[clinicId]/route.js

import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

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
    const { clinicId } = await params;

    const { data: clinic, error } = await supabase
      .from('clinics')
      .select('image_urls')
      .eq('id', clinicId)
      .single();

    if (error || !clinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ images: clinic.image_urls || [] }, 'Images fetched successfully');
  } catch (error) {
    console.error('Error fetching clinic images:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}