import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// DELETE: /api/v1/appointment/cancel/[id]
/**
 * @swagger
 * /api/v1/appointment/cancel/{id}:
 *   delete:
 *     summary: Cancel an appointment
 *     description: Logically cancels an appointment and captures the reason. Only authorized staff and doctors allowed.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Either appointmentId (UUID) or MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: The reason for cancellation
 *                 example: "Patient requested cancellation"
 *     responses:
 *       200:
 *         description: Appointment cancelled successfully
 *       400:
 *         description: Validation failed (reason missing)
 *       404:
 *         description: Appointment not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const DELETE = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req, { params }) => {
    return await appointmentController.cancelAppointment(req, { params });
  })
);
