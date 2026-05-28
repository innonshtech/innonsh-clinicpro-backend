import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as visitController from '@/controllers/visitController';

// GET: /api/v1/visit/patient/[id]
/**
 * @swagger
 * /api/v1/visit/patient/{id}:
 *   get:
 *     summary: Fetch Patient Visit History
 *     description: Retrieves all past consultations (visits) for a specific patient. Sorted by latest first. Restricted to clinic staff and the patient.
 *     tags: [Visit]
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
 *         description: Visit history fetched successfully
 *       404:
 *         description: Patient not found
 *       403:
 *         description: Access Denied
 *       500:
 *         description: Server Error
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'clinic', 'doctor', 'receptionist', 'patient'], async (req, { params }) => {
    return await visitController.getPatientVisitHistory(req, { params });
  })
);
