import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';

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
    const { id } = await params;
    const { status, approved, rejectionReason } = await req.json();

    if (!id || !status) {
      return ApiResponse.error('ID and Status are required', 'MISSING_FIELD', [], 400);
    }

    const updateData = { status };

    if (rejectionReason) {
      updateData.rejection_reason = rejectionReason;
    }

    const { data: clinic, error } = await supabase
      .from('clinics')
      .update(updateData)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) throw error;

    if (!clinic) {
      return ApiResponse.error('Clinic not found', 'NOT_FOUND', [], 404);
    }

    // Remap for frontend
    clinic._id = clinic.id;
    clinic.rejectionReason = clinic.rejection_reason;
    clinic.clinicName = clinic.clinic_name;
    clinic.clinicType = clinic.clinic_type;
    clinic.approved = clinic.status === 'active';
    
    return ApiResponse.success({ clinic }, 'Status updated successfully');

  } catch (error) {
    console.error('Error updating clinic status:', error);
    return ApiResponse.error('Internal Server Error', 'SERVER_ERROR', error.message, 500);
  }
}