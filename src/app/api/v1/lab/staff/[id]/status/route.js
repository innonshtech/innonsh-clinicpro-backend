import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labStaffService } from '@/services/labStaffService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * PATCH /api/v1/lab/staff/[id]/status
 * Toggle staff member active/inactive status scoped strictly to the authenticated laboratory tenant.
 */
export const PATCH = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    // Role check: Only user with manage_staff permission can toggle staff status
    if (!hasLabPermission(req.user, LAB_PERMISSIONS.MANAGE_STAFF)) {
      return ApiResponse.error('Access Denied: You do not have permission to manage laboratory staff.', 'FORBIDDEN', [], 403);
    }

    const { id } = await params;
    const updated = await labStaffService.toggleStaffStatus(labId, id, req.user);

    return ApiResponse.success(
      { staff: updated },
      'Staff member status updated successfully'
    );
  })
);

