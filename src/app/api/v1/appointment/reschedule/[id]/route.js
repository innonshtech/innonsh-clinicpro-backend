import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// PUT: /api/v1/appointment/reschedule/[id]
/**
 * @swagger
 * /api/v1/appointment/reschedule/{id}:
 *   put:
 *     summary: Reschedule Appointment
 *     description: Reschedules an appointment to a new date and time slot. Resets queue number if already checked in.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointmentDate
 *               - timeSlot
 *             properties:
 *               appointmentDate:
 *                 type: string
 *                 example: '2026-04-30'
 *               timeSlot:
 *                 type: string
 *                 example: '10:00 AM'
 *               notes:
 *                 type: string
 *                 example: 'Patient requested to change time'
 *     responses:
 *       200:
 *         description: Appointment rescheduled successfully
 *       400:
 *         description: Validation error
 *       403:
 *         description: Access Denied
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Slot occupied
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req, { params }) => {
    // Standardize params for the controller
    const context = { params: { id: params.id } };
    return await appointmentController.rescheduleAppointment(req, context);
  })
);

// OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}
