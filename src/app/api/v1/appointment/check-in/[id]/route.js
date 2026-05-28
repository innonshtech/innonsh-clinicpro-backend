import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// PUT: /api/v1/appointment/check-in/[id]
/**
 * @swagger
 * /api/v1/appointment/check-in/{id}:
 *   put:
 *     summary: Patient Check-in
 *     description: Marks a patient as checked-in and assigns a queue number.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Appointment ID (UUID) or MongoDB ObjectId
 *     responses:
 *       200:
 *         description: Patient checked in successfully
 *       400:
 *         description: Bad request (already checked in or not booked)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (only receptionist/admin)
 *       404:
 *         description: Appointment not found
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, context) => {
    return await appointmentController.checkInAppointment(req, context);
  })
);
