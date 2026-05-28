import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as billingController from '@/controllers/billingController';

// PUT: /api/v1/billing/refund/[id]
/**
 * @swagger
 * /api/v1/billing/refund/{id}:
 *   put:
 *     summary: Refund Invoice
 *     description: Processes a refund for a previously paid invoice.
 *     tags: [Billing]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Billing ID or internal MongoDB ObjectId
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refundAmount
 *               - reason
 *             properties:
 *               refundAmount:
 *                 type: number
 *                 example: 500
 *               reason:
 *                 type: string
 *                 example: "Patient cancelled last minute, partial refund"
 *     responses:
 *       200:
 *         description: Refund processed successfully
 *       400:
 *         description: Validation error or Invalid Status
 *       403:
 *         description: Access Denied
 *       404:
 *         description: Invoice not found
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, { params }) => {
    const context = { params: { id: params.id } };
    return await billingController.processRefund(req, context);
  })
);

// OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}
