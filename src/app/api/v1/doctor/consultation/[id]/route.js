import { getConsultationDetails } from '@/controllers/appointmentController';
import { withRoles } from '@/utils/authGuard';
import { withErrorHandler } from '@/utils/apiHandler';

/**
 * @swagger
 * /api/v1/doctor/consultation/{id}:
 *   get:
 *     summary: Fetch full consultation details for a specific appointment
 *     tags: [Doctor]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Consultation details fetched successfully
 *       403:
 *         description: Forbidden (Not a doctor)
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Internal Server Error
 */
export const GET = withErrorHandler(
  withRoles(['doctor', 'receptionist', 'admin', 'clinic'], async (req, { params }) => {
    return await getConsultationDetails(req, { params });
  })
);
