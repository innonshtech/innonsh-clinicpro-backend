import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as queueController from '@/controllers/queueController';

// GET: /api/v1/queue/[id]
/**
 * @swagger
 * /api/v1/queue/{id}:
 *   get:
 *     summary: Fetch Live Queue for Doctor
 *     description: Provides the real-time queue categorization (Current, Next, Waiting) for a specific doctor. Sorted by queue number.
 *     tags: [Queue]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the doctor (ObjectId)
 *     responses:
 *       200:
 *         description: Doctor queue fetched successfully
 *       400:
 *         description: Invalid Doctor ID
 *       403:
 *         description: Access Denied
 *       500:
 *         description: Server Error
 */
export const GET = withErrorHandler(
  withRoles(['admin', 'doctor', 'receptionist'], async (req, { params }) => {
    return await queueController.getDoctorQueue(req, { params });
  })
);
