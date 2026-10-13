import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labBillingService } from '@/services/labBillingService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/billing/invoices
 * List invoices scoped strictly to authenticated lab tenant.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    if (!hasLabPermission(req.user, LAB_PERMISSIONS.VIEW_BILLING)) {
      return ApiResponse.error('Access Denied: You do not have permission to access laboratory billing.', 'FORBIDDEN', [], 403);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';

    const invoices = await labBillingService.listInvoices(labId, { search, status });
    return ApiResponse.success({ invoices, count: invoices.length }, 'Invoices retrieved successfully');
  })
);

/**
 * POST /api/v1/lab/billing/invoices
 * Create invoice from eligible order.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    // Role check: Only user with manage_billing permission can create invoices
    if (!hasLabPermission(req.user, LAB_PERMISSIONS.MANAGE_BILLING)) {
      return ApiResponse.error('Access Denied: You do not have permission to generate invoices.', 'FORBIDDEN', [], 403);
    }

    const body = await req.json();
    const created = await labBillingService.createInvoice(labId, body, req.user);

    return ApiResponse.success({ invoice: created }, 'Invoice generated successfully', 201);
  })
);
