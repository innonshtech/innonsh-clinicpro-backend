import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labOrderService } from '@/services/labOrderService';

export const GET = withErrorHandler(
  withRoles(['lab', 'doctor', 'receptionist', 'clinic', 'admin'], async (req, { params }) => {
    const user = {
      id: req.user?.id,
      role: req.user?.role,
      labId: req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null),
      doctorId: req.user?.doctorId || (req.user?.role === 'doctor' ? req.user?.id : null),
      receptionistId: req.user?.receptionistId || (req.user?.role === 'receptionist' ? req.user?.id : null),
      clinicId: req.user?.clinicId || (req.user?.role === 'clinic' ? req.user?.id : null)
    };

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Order ID is required', 'BAD_REQUEST', [], 400);
    }

    const order = await labOrderService.getOrderById(id, user);
    if (!order) {
      return ApiResponse.error('Lab order not found or access denied', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ order }, 'Lab order details retrieved successfully');
  })
);
