import { withRoles } from '@/utils/authGuard';
import * as billingController from '@/controllers/billingController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * GET /api/v1/billing/:id
 * Fetches details of a specific invoice
 */
export const GET = withRoles(['doctor', 'receptionist', 'admin', 'patient'])(async (req, { params }) => {
  try {
    return await billingController.getInvoice(req, { params });
  } catch (error) {
    console.error('Error in GET /api/v1/billing/[id]:', error);
    return ApiResponse.error('Internal Server Error', 'INTERNAL_ERROR', [], 500);
  }
});
