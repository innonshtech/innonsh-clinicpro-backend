import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labOrderService } from '@/services/labOrderService';

export const GET = withErrorHandler(
  withRoles(['lab', 'doctor', 'receptionist', 'clinic', 'admin'], async (req) => {
    const user = {
      id: req.user?.id,
      role: req.user?.role,
      labId: req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null),
      doctorId: req.user?.doctorId || (req.user?.role === 'doctor' ? req.user?.id : null),
      receptionistId: req.user?.receptionistId || (req.user?.role === 'receptionist' ? req.user?.id : null),
      clinicId: req.user?.clinicId || (req.user?.role === 'clinic' ? req.user?.id : null)
    };

    if (user.clinicId) {
      const { checkClinicModule } = await import('@/utils/moduleGuard');
      const labCheck = await checkClinicModule(user.clinicId, 'lab');
      if (!labCheck.enabled) {
        return ApiResponse.error('Access Denied: The Lab module is not enabled for this clinic.', 'LAB_MODULE_DISABLED', [], 403);
      }
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';

    const orders = await labOrderService.listOrders({ search, status }, user);
    return ApiResponse.success({ orders }, 'Lab orders retrieved successfully');
  })
);

export const POST = withErrorHandler(
  withRoles(['doctor', 'receptionist', 'admin'], async (req) => {
    if (req.user?.role === 'clinic') {
      return ApiResponse.error('Forbidden. Clinics cannot create lab orders; only Doctors and Receptionists can create lab orders.', 'FORBIDDEN', [], 403);
    }

    const user = {
      id: req.user?.id,
      role: req.user?.role,
      labId: req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null),
      doctorId: req.user?.doctorId || (req.user?.role === 'doctor' ? req.user?.id : null),
      receptionistId: req.user?.receptionistId || (req.user?.role === 'receptionist' ? req.user?.id : null),
      clinicId: req.user?.clinicId || (req.user?.role === 'clinic' ? req.user?.id : null)
    };

    if (user.clinicId) {
      const { checkClinicModule } = await import('@/utils/moduleGuard');
      const labCheck = await checkClinicModule(user.clinicId, 'lab');
      if (!labCheck.enabled) {
        return ApiResponse.error('Lab module is disabled for this clinic.', 'FORBIDDEN', [], 403);
      }
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    try {
      const order = await labOrderService.createOrder(body, user);
      return ApiResponse.success({ order }, 'Lab order created successfully', 201);
    } catch (err) {
      return ApiResponse.error(err.message || 'Failed to create lab order', 'CREATION_FAILED', [], 400);
    }
  })
);
