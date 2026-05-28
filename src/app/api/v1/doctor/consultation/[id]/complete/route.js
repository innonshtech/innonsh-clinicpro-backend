import { completeConsultation } from '@/controllers/appointmentController';
import { withRoles } from '@/utils/authGuard';
import { withErrorHandler } from '@/utils/apiHandler';

/**
 * @swagger
 * /api/v1/doctor/consultation/{id}/complete:
 *   post:
 *     summary: Complete a consultation (add diagnosis, prescription)
 *     tags: [Doctor]
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
 *             properties:
 *               diagnosis:
 *                 type: string
 *               medicines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     dosage:
 *                       type: string
 *                     frequency:
 *                       type: string
 *                     duration:
 *                       type: string
 *     responses:
 *       200:
 *         description: Consultation completed successfully
 *       400:
 *         description: Consultation already completed or invalid request
 *       403:
 *         description: Forbidden (Not a doctor)
 *       404:
 *         description: Appointment not found
 *       500:
 *         description: Internal Server Error
 */
export const POST = withErrorHandler(
  withRoles(['doctor'], async (req, { params }) => {
    return await completeConsultation(req, { params });
  })
);
