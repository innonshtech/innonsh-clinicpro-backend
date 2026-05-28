import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as patientController from '@/controllers/patientController';

// GET: /api/v1/patient/search
/**
 * @swagger
 * /api/v1/patient/search:
 *   get:
 *     summary: Specialized patient search
 *     description: Search patients by name, phone number, or patient ID with partial matching.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Search string (matches name, phone, or ID)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of results to return
 *     responses:
 *       200:
 *         description: Search results fetched successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    return await patientController.searchPatients(req);
  })
);
