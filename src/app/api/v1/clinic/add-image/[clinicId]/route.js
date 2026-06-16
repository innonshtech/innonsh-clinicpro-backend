import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

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
    const { clinicId } = await params;
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return ApiResponse.error('Image URL is required', 'MISSING_FIELD', [], 400);
    }

    const { data: clinic, error: fetchError } = await supabase
      .from('clinics')
      .select('image_urls')
      .eq('id', clinicId)
      .single();

    if (fetchError || !clinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    const currentImages = clinic.image_urls || [];
    const newImages = [...currentImages, imageUrl];

    const { data: updatedClinic, error: updateError } = await supabase
      .from('clinics')
      .update({ image_urls: newImages })
      .eq('id', clinicId)
      .select('image_urls')
      .single();

    if (updateError) throw updateError;

    return ApiResponse.success({ images: updatedClinic.image_urls }, 'Image added successfully');
  } catch (error) {
    console.error('Error adding image to clinic:', error);
    return ApiResponse.error('Server error', 'SERVER_ERROR', error.message, 500);
  }
}