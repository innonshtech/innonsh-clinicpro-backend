import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import mongoose from 'mongoose';
import { withRoles } from '@/utils/authGuard';
import { withErrorHandler } from '@/utils/apiHandler';

// PATCH: /api/v1/appointment/addMedicines
/**
 * @swagger
 * /api/v1/appointment/addMedicines:
 *   patch:
 *     summary: PATCH request for /api/v1/appointment/addMedicines
 *     tags: [Appointment]
 *     responses:
 *       200:
 *         description: Successful response
 *       400:
 *         description: Bad Request
 *       500:
 *         description: Internal Server Error
 */
export const PATCH = withErrorHandler(
  withRoles(['doctor'], async (req) => {
    try {
      await dbConnect();
      const { appointmentId, description, medicines } = await req.json();

      // Validate appointmentId
      if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
        return ApiResponse.error("Invalid or missing appointmentId", "INVALID_ID", [], 400);
      }

      // Build update object dynamically
      const updateData = {};
      if (description !== undefined) updateData.description = description;
      if (medicines !== undefined) updateData.medicines = medicines;

      const updatedAppointment = await Appointment.findByIdAndUpdate(
        appointmentId,
        { $set: updateData },
        { new: true }
      );

      if (!updatedAppointment) {
        return ApiResponse.error("Appointment not found", "NOT_FOUND", [], 404);
      }

      return ApiResponse.success({ appointment: updatedAppointment }, "Appointment updated successfully");
    } catch (error) {
      console.error("Error updating appointment prescription:", error);
      return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
    }
  })
);