import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as billingController from '@/controllers/billingController';

// PUT: /api/v1/billing/payment/[id]
/**
 * @swagger
 * /api/v1/billing/payment/{id}:
 *   put:
 *     summary: Process Partial or Full Payment
 *     description: Processes a payment against an invoice and updates remaining balance.
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
 *               - paymentAmount
 *               - paymentMethod
 *             properties:
 *               paymentAmount:
 *                 type: number
 *                 example: 500
 *               paymentMethod:
 *                 type: string
 *                 enum: ['cash', 'card', 'upi', 'online', 'other']
 *               transactionId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Payment processed successfully
 *       400:
 *         description: Validation error, Invalid Status, or Amount exceeds balance
 *       403:
 *         description: Access Denied
 *       404:
 *         description: Invoice not found
 */
export const PUT = withErrorHandler(
  withRoles(['admin', 'receptionist'], async (req, { params }) => {
    const context = { params: { id: params.id } };
    return await billingController.processPayment(req, context);
  })
);

// OPTIONS for CORS
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
  });
}
