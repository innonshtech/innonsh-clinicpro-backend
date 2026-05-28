import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// POST: /api/v1/appointment/create
/**
 * @swagger
 * /api/v1/appointment/create:
 *   post:
 *     summary: Book a new appointment
 *     description: Creates a new appointment. Only Admin or Receptionist roles are authorized.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - patientId
 *               - doctorId
 *               - appointmentDate
 *               - timeSlot
 *               - reason
 *             properties:
 *               patientId:
 *                 type: string
 *               doctorId:
 *                 type: string
 *               appointmentDate:
 *                 type: string
 *                 format: date
 *               timeSlot:
 *                 type: string
 *               reason:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Appointment booked successfully
 *       400:
 *         description: Validation failed or Double booking
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Role not allowed)
 */
export const POST = withErrorHandler(
  withRoles(['admin', 'receptionist', 'clinic'], async (req) => {
    return await appointmentController.createAppointment(req);
  })
);