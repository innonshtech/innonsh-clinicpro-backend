import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as appointmentController from '@/controllers/appointmentController';

// GET: /api/v1/appointment/patient/[id]
/**
 * @swagger
 * /api/v1/appointment/patient/{id}:
 *   get:
 *     summary: Fetch appointment history for a specific patient
 *     description: Returns a sorted list of all appointments for a patient. Roles: admin, receptionist, doctor.
 *     tags: [Appointment]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Either patientId (UUID) or MongoDB ObjectId
 *     responses:
 *       200:
 *         description: History fetched successfully
 *       404:
 *         description: Patient not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req, { params }) => {
    return await appointmentController.getPatientAppointmentHistory(req, { params });
  })
);
