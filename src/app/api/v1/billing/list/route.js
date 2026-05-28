import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import * as billingController from '@/controllers/billingController';

/**
 * GET /api/v1/billing/list
 * Fetches a list of invoices with filters and pagination
 */
export const GET = withErrorHandler(
  withRoles(['doctor', 'receptionist', 'admin'], async (req) => {
    return await billingController.listBills(req);
  })
);
