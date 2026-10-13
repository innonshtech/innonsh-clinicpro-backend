import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labOrderService } from '@/services/labOrderService';

async function handleStatus(req, { params }) {
  const user = {
    id: req.user?.id,
    role: req.user?.role,
    labId: req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null)
  };

  const { id } = await params;
  if (!id) {
    return ApiResponse.error('Order ID is required', 'BAD_REQUEST', [], 400);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
  }

  const { status, rejection_reason } = body;
  if (!status) {
    return ApiResponse.error('Status is required', 'BAD_REQUEST', [], 400);
  }

  try {
    const updatedOrder = await labOrderService.updateOrderStatus(id, status, user, rejection_reason);
    return ApiResponse.success({ order: updatedOrder }, 'Order status updated successfully');
  } catch (err) {
    const statusCode = err.status || 400;
    return ApiResponse.error(err.message || 'Failed to update order status', 'UPDATE_FAILED', [], statusCode);
  }
}

export const PUT = withErrorHandler(withRoles(['lab', 'admin'], handleStatus));
export const PATCH = withErrorHandler(withRoles(['lab', 'admin'], handleStatus));
