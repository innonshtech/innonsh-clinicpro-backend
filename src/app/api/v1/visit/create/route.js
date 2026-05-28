import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as visitController from '@/controllers/visitController';

// POST: /api/v1/visit/create
/**
 * @swagger
 * /api/v1/visit/create:
 *   post:
 *     summary: Create Visit & Start Consultation
 *     description: Creates a new visit record when a doctor starts a consultation and updates the appointment status to 'in_progress'. Restricted to doctors.
 *     tags: [Visit]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - appointment_id
 *               - doctor_id
 *               - patient_id
 *             properties:
 *               appointment_id:
 *                 type: string
 *                 description: The ID of the appointment (ObjectId or String ID)
 *               doctor_id:
 *                 type: string
 *                 description: The connected doctor's ObjectId
 *               patient_id:
 *                 type: string
 *                 description: The connected patient's ObjectId
 *     responses:
 *       201:
 *         description: Visit created and consultation started successfully
 *       400:
 *         description: Validation failed or Cannot start consultation (bad status)
 *       403:
 *         description: Access Denied
 *       404:
 *         description: Appointment not found
 *       409:
 *         description: Visit already exists for this appointment
 *       500:
 *         description: Server Error
 */
export const POST = withErrorHandler(
  withRoles(['doctor'], async (req) => {
    return await visitController.createVisit(req);
  })
);
