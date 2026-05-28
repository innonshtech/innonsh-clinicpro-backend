// app/api/doctors/[id]/route.js

import { ApiResponse } from '@/utils/apiResponse';
import Doctor from '@/models/Doctor';
import dbConnect from '@/utils/db';
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
    await dbConnect();
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

    const updatedDoctor = await Doctor.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });

    if (!updatedDoctor) {
      return ApiResponse.error('Doctor not found', 'USER_NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ doctor: updatedDoctor }, 'Doctor updated successfully');
  })
);