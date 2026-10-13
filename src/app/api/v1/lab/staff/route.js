import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labStaffService } from '@/services/labStaffService';
import { hasLabPermission, LAB_PERMISSIONS } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/staff
 * List all staff members scoped strictly to the authenticated laboratory tenant.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const role = searchParams.get('role') || 'all';
    const status = searchParams.get('status') || 'all';

    const staff = await labStaffService.listStaff(labId, { search, role, status });
    return ApiResponse.success({ staff, count: staff.length }, 'Lab staff members retrieved successfully');
  })
);

/**
 * POST /api/v1/lab/staff
 * Add a new laboratory staff member under the authenticated laboratory tenant.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identity missing from authenticated token', 'UNAUTHORIZED', [], 401);
    }

    // Role check: Only user with manage_staff permission can create staff
    if (!hasLabPermission(req.user, LAB_PERMISSIONS.MANAGE_STAFF)) {
      return ApiResponse.error('Access Denied: You do not have permission to manage laboratory staff.', 'FORBIDDEN', [], 403);
    }

    const body = await req.json();
    const created = await labStaffService.createStaff(labId, body, req.user);

    return ApiResponse.success({ staff: created }, 'Staff member added successfully', 201);
  })
);
