import { ApiResponse } from '@/utils/apiResponse';
import dbConnect from '@/utils/db';
import Appointment from '@/models/Appointments';
import mongoose from 'mongoose';
import * as appointmentService from '@/services/appointmentService';
import { withRoles } from '@/utils/authGuard';
import { withErrorHandler } from '@/utils/apiHandler';

// PATCH: /api/v1/appointment/updateStatus
/**
 * @swagger
 * /api/v1/appointment/updateStatus:
 *   patch:
 *     summary: PATCH request for /api/v1/appointment/updateStatus
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
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    try {
      await dbConnect();
      const { appointmentId, status } = await req.json();

      // Validate input
      if (!appointmentId || !mongoose.Types.ObjectId.isValid(appointmentId)) {
        return ApiResponse.error("Invalid appointment ID", "INVALID_ID", [], 400);
      }

      if (!status) {
        return ApiResponse.error("Missing status value", "MISSING_FIELD", [], 400);
      }

      // 2. Call service to enforce RBAC and data isolation
      const appointment = await appointmentService.updateAppointmentStatus(appointmentId, status, req.user);

      return ApiResponse.success({ appointment }, "Status updated successfully");
    } catch (error) {
      console.error("Error updating status:", error);
      return ApiResponse.error("Internal Server Error", "SERVER_ERROR", error.message, 500);
    }
  })
);