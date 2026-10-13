import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labStaffService } from '@/services/labStaffService';

/**
 * GET /api/v1/lab/staff/roles
 * Retrieve available laboratory roles, labels, descriptions, and default permissions.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async () => {
    const metadata = labStaffService.getRolesMetadata();
    return ApiResponse.success(metadata, 'Laboratory roles and permissions retrieved successfully');
  })
);
