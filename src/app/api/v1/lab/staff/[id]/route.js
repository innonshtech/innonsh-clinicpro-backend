import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labStaffService } from '@/services/labStaffService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/staff/[id]
 * Get details of a single staff member scoped strictly to the authenticated laboratory tenant.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    const { id } = await params;
    const staff = await labStaffService.getStaffById(labId, id);

    if (!staff) {
      return ApiResponse.error('Staff member not found or access denied', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ staff }, 'Staff member details retrieved successfully');
  })
);

/**
 * PUT /api/v1/lab/staff/[id]
 * Update staff member details scoped strictly to the authenticated laboratory tenant.
 */
export const PUT = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    // Role check: Only user with manage_staff permission can update staff
    if (!hasLabPermission(req.user, LAB_PERMISSIONS.MANAGE_STAFF)) {
      return ApiResponse.error('Access Denied: You do not have permission to manage laboratory staff.', 'FORBIDDEN', [], 403);
    }

    const { id } = await params;
    const body = await req.json();

    const updated = await labStaffService.updateStaff(labId, id, body, req.user);
    return ApiResponse.success({ staff: updated }, 'Staff member updated successfully');
  })
);
