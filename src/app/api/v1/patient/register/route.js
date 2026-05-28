import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as patientController from '@/controllers/patientController';

// POST: /api/v1/patient/register
/**
 * @swagger
 * /api/v1/patient/register:
 *   post:
 *     summary: Register a new patient
 *     description: Creates a new patient account. Only Admin or Receptionist roles are authorized.
 *     tags: [Patient]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - phoneNumber
 *               - dateOfBirth
 *               - gender
 *               - password
 *             properties:
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "johndoe@example.com"
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-01"
 *               gender:
 *                 type: string
 *                 example: "Male"
 *               bloodGroup:
 *                 type: string
 *                 example: "O+"
 *               emergencyContact:
 *                 type: string
 *                 example: "+1098765432"
 *               password:
 *                 type: string
 *                 example: "StrongPassword123!"
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zipCode:
 *                 type: string
 *     responses:
 *       201:
 *         description: Patient registered successfully
 *       400:
 *         description: Validation failed or Duplicate Entry
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (Role not allowed)
 */
export const POST = withErrorHandler(async (req) => {
  return await patientController.register(req);
});
