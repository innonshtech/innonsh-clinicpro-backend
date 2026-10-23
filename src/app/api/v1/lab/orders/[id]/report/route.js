import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labOrderService } from '@/services/labOrderService';

async function handleAttachReport(req, { params }) {
  const user = {
    id: req.user?.id,
    role: req.user?.role,
    labId: req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null),
    labRole: req.user?.labRole || null,
    permissions: req.user?.permissions || [],
    name: req.user?.name || req.user?.first_name || null,
    first_name: req.user?.first_name || null,
    last_name: req.user?.last_name || null
  };

  const { id } = await params;
  if (!id) {
    return ApiResponse.error('Order ID is required', 'BAD_REQUEST', [], 400);
  }

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
  }

  try {
    const updatedOrder = await labOrderService.attachRadiologyReportToLabOrder(id, user, body);
    return ApiResponse.success({ order: updatedOrder }, 'Diagnostic report attached and order finalized successfully', 200);
  } catch (err) {
    const statusCode = err.status || err.statusCode || 400;
    return ApiResponse.error(err.message || 'Failed to attach report', err.code || 'REPORT_FAILED', [], statusCode);
  }
}

export const POST = withErrorHandler(withRoles(['lab', 'admin'], handleAttachReport));
export const PATCH = withErrorHandler(withRoles(['lab', 'admin'], handleAttachReport));
export const PUT = withErrorHandler(withRoles(['lab', 'admin'], handleAttachReport));
