import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labPackageService } from '@/services/labPackageService';
import { isLabAdmin } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/packages/[id]
 * View details of a package, strictly verified to belong to the authenticated laboratory.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || req.user?.id;
    if (!labId) {
      return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Package ID is required', 'BAD_REQUEST', [], 400);
    }

    const pkg = await labPackageService.getPackageById(labId, id);
    if (!pkg) {
      return ApiResponse.error('Test package not found or access denied', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ package: pkg }, 'Test package details retrieved');
  })
);

/**
 * PUT/PATCH /api/v1/lab/packages/[id]
 * Update a package or toggle its status (activate/deactivate) - Lab Admin only.
 */
async function handleUpdate(req, { params }) {
  const labId = req.user?.labId || req.user?.id;
  if (!labId) {
    return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
  }

  if (!isLabAdmin(req.user)) {
    return ApiResponse.error('Access Denied: Technicians and Pathologists have view-only access to test packages.', 'FORBIDDEN', [], 403);
  }

  const { id } = await params;
  if (!id) {
    return ApiResponse.error('Package ID is required', 'BAD_REQUEST', [], 400);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
  }

  try {
    const updatedPkg = await labPackageService.updatePackage(labId, id, body);
    return ApiResponse.success({ package: updatedPkg }, 'Test package updated successfully');
  } catch (err) {
    if (err.code === 'DUPLICATE_CODE') {
      return ApiResponse.error(err.message, 'DUPLICATE_CODE', [], 409);
    }
    if (err.code === 'INVALID_TEST_SELECTION' || err.status === 403) {
      return ApiResponse.error(err.message, 'INVALID_TEST_SELECTION', [], 403);
    }
    if (err.status === 404) {
      return ApiResponse.error(err.message || 'Test package not found', 'NOT_FOUND', [], 404);
    }
    return ApiResponse.error(err.message || 'Failed to update test package', 'UPDATE_FAILED', [], 400);
  }
}

export const PUT = withErrorHandler(withRoles(['lab', 'admin'], handleUpdate));
export const PATCH = withErrorHandler(withRoles(['lab', 'admin'], handleUpdate));
