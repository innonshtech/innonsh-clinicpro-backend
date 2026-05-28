import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// PUT: /api/v1/appointment/status/[id]
/**
 * @swagger
 * /api/v1/appointment/status/{id}:
 *   put:
 *     summary: Update appointment status
 *     description: Updates the status of an appointment. Authorized staff and doctors only.
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
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [booked, checked_in, in_progress, completed, cancelled]
 *                 example: "checked_in"
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Validation failed or invalid status
 *       404:
 *         description: Appointment not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req, { params }) => {
    return await appointmentController.updateAppointmentStatus(req, { params });
  })
);
