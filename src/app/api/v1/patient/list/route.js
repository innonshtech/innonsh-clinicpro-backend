import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as patientController from '@/controllers/patientController';

// GET: /api/v1/patient/list
/**
 * @swagger
 * /api/v1/patient/list:
 *   get:
 *     summary: Fetch paginated list of patients
 *     description: Returns a list of patients filtered by name, phone, or date range. Role-based access applied.
 *     tags: [Patient]
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
 *         name: name
 *         schema:
 *           type: string
 *         description: Fuzzy search for first or last name
 *       - in: query
 *         name: phoneNumber
 *         schema:
 *           type: string
 *         description: Search by phone number
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for registration date filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for registration date filter
 *     responses:
 *       200:
 *         description: Patients fetched successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'receptionist', 'doctor'], async (req) => {
    return await patientController.getPatientList(req);
  })
);
