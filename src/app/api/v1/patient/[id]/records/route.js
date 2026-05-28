import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as patientController from '@/controllers/patientController';

// GET: /api/v1/patient/[id]/records
/**
 * @swagger
 * /api/v1/patient/{id}/records:
 *   get:
 *     summary: Fetch patient visit history
 *     description: Returns a list of visit records for a specific patient.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Patient ID (UUID or MongoDB ObjectId)
 *     responses:
 *       200:
 *         description: Patient records fetched successfully
 *       404:
 *         description: Patient not found
 *       403:
 *         description: Forbidden
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'clinic', 'receptionist', 'doctor', 'patient'], async (req, { params }) => {
    return await patientController.getPatientRecords(req, { params });
  })
);
