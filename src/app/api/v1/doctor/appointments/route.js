import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// GET: /api/v1/doctor/appointments
/**
 * @swagger
 * /api/v1/doctor/appointments:
 *   get:
 *     summary: Fetch Doctor Daily Appointments
 *     description: Returns all appointments assigned to the logged-in doctor for a given day (defaults to today).
 *     tags: [Doctor Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Optional. The date to fetch appointments for (YYYY-MM-DD). Defaults to today.
 *     responses:
 *       200:
 *         description: Doctor's daily appointments fetched successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Not a doctor)
 *       500:
 *         description: Internal Server Error
 */
export const GET = withErrorHandler(
  withRoles(['doctor', 'receptionist', 'admin', 'clinic'], async (req, context) => {
    return await appointmentController.getDoctorDailyAppointments(req, context);
  })
);
