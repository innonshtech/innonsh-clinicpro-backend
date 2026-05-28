import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as patientController from '@/controllers/patientController';

// DELETE: /api/v1/patient/delete/[id]
/**
 * @swagger
 * /api/v1/patient/delete/{id}:
 *   delete:
 *     summary: Delete a patient profile
 *     description: Deletes a patient by ID. Restricted to admin and receptionists.
 *     tags: [Patient]
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
 *         description: Patient deleted successfully
 *       404:
 *         description: Patient not found
 *       403:
 *         description: Access Denied
 *       401:
 *         description: Unauthorized
 */
export const DELETE = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, { params }) => {
    return await patientController.deletePatient(req, { params });
  })
);
