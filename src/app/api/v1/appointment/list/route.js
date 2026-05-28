import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// GET: /api/v1/appointment/list
/**
 * @swagger
 * /api/v1/appointment/list:
 *   get:
 *     summary: Fetch appointment list
 *     description: Returns a paginated and filtered list of appointments. Role-based scoping applied.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: doctorId
 *         schema:
 *           type: string
 *         description: Filter by doctor (authorized staff only)
 *       - in: query
 *         name: date
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by date (YYYY-MM-DD)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [booked, completed, cancelled]
 *     responses:
 *       200:
 *         description: Appointments fetched successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    return await appointmentController.getAppointmentList(req);
  })
);
