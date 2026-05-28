import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as patientController from '@/controllers/patientController';

// GET: /api/v1/patient/[id]
/**
 * @swagger
 * /api/v1/patient/{id}:
 *   get:
 *     summary: Fetch a single patient profile
 *     description: Returns detailed patient information by ID. Role-based access and clinic scoping applied.
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
 *         description: Patient profile fetched successfully
 *       404:
 *         description: Patient not found
 *       403:
 *         description: Access Denied (Scoping restriction)
 *       401:
 *         description: Unauthorized
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'clinic', 'receptionist', 'doctor', 'patient'], async (req, { params }) => {
    return await patientController.getPatientProfile(req, { params });
  })
);
 
// PUT: /api/v1/patient/[id]
/**
 * @swagger
 * /api/v1/patient/{id}:
 *   put:
 *     summary: Update a patient profile
 *     description: Updates patient details by ID. Restricted to admin, clinic, and receptionists.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PatientUpdate'
 *     responses:
 *       200:
 *         description: Patient updated successfully
 *       404:
 *         description: Patient not found
 *       403:
 *         description: Access Denied
 *       401:
 *         description: Unauthorized
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'clinic', 'receptionist'], async (req, { params }) => {
    return await patientController.updatePatient(req, { params });
  })
);
