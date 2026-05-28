import { withRoles } from '@/utils/authGuard';
import * as billingController from '@/controllers/billingController';
import { ApiResponse } from '@/utils/apiResponse';

/**
 * POST /api/v1/billing/create
 * Generates an invoice for a visit
 */
export const POST = withRoles(['doctor', 'receptionist', 'admin'], async (req) => {
  try {
    return await billingController.createBilling(req);
  } catch (error) {
    console.error('Error in POST /api/v1/billing/create:', error);
    return ApiResponse.error('Internal Server Error', 'INTERNAL_ERROR', [], 500);
  }
});
