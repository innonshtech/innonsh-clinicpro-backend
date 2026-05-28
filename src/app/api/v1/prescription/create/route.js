import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as prescriptionController from '@/controllers/prescriptionController';

// POST: /api/v1/prescription/create
/**
 * @swagger
 * /api/v1/prescription/create:
 *   post:
 *     summary: Create Prescription for Visit
 *     description: Allows doctors to prescribe medicines during a consultation visit.
 *     tags: [Prescription]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - visit_id
 *               - medicines
 *             properties:
 *               visit_id:
 *                 type: string
 *                 description: The ID of the visit (ObjectId)
 *               medicines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - dosage
 *                     - duration
 *                   properties:
 *                     name:
 *                       type: string
 *                     dosage:
 *                       type: string
 *                     duration:
 *                       type: string
 *                     instructions:
 *                       type: string
 *     responses:
 *       201:
 *         description: Prescription added successfully
 *       400:
 *         description: Validation failed or Invalid Visit ID
 *       403:
 *         description: Access Denied
 *       404:
 *         description: Visit not found
 *       500:
 *         description: Server Error
 */
export const POST = withErrorHandler(
  withRoles(['doctor'], async (req) => {
    return await prescriptionController.createPrescription(req);
  })
);
