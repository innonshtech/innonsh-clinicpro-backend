import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labBillingService } from '@/services/labBillingService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * POST /api/v1/lab/billing/invoices/[id]/payments
 * Record a payment against an issued or partially-paid invoice.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.MANAGE_BILLING)) {
      return ApiResponse.error('Access Denied: You do not have permission to record payments.', 'FORBIDDEN', [], 403);
    }

    const { id } = await params;
    const body = await req.json();

    const payment = await labBillingService.recordPayment(labId, id, body, req.user);

    return ApiResponse.success({ payment }, 'Payment recorded successfully', 201);
  })
);
