// app/api/doctors/[id]/route.js

import { ApiResponse } from '@/utils/apiResponse';
import { supabase } from '@/lib/supabase';
import bcrypt from 'bcryptjs';
import { doctorUpdateSchema } from '@/validations/userValidation';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';

/**
 * @swagger
 * /api/v1/doctor/update-by-id/{id}:
 *   put:
 *     summary: PUT request for /api/v1/doctor/update-by-id/{id}
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
export const PUT = withErrorHandler(
  withRoles(['admin', 'doctor', 'clinic'], async (req, { params }) => {
    const resolvedParams = await params;
    const { id } = resolvedParams;
    const body = await req.json();

    const parsed = doctorUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return ApiResponse.error(
        'Validation failed',
        'VALIDATION_ERROR',
        parsed.error.format(),
        400
      );
    }
    
    let updates = parsed.data;

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 12);
    }

    // Convert camelCase to snake_case for Supabase
    const mappedUpdates = Object.fromEntries(
      Object.entries(updates).map(([k, v]) => [
        k.replace(/([A-Z])/g, '_$1').toLowerCase(),
        v
      ])
    );

    const { data: updatedDoctor, error } = await supabase
      .from('doctors')
      .update(mappedUpdates)
      .eq('id', id)
      .select()
      .maybeSingle();

    if (error) {
      console.error('Supabase update error:', error);
      throw error;
    }

    if (!updatedDoctor) {
      return ApiResponse.error('Doctor not found', 'USER_NOT_FOUND', [], 404);
    }

    // Preserve legacy ID for frontend
    updatedDoctor._id = updatedDoctor.id;
    delete updatedDoctor.password;

    return ApiResponse.success({ doctor: updatedDoctor }, 'Doctor updated successfully');
  })
);