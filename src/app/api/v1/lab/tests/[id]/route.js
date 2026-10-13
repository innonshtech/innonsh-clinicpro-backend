import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labTestService } from '@/services/labTestService';
import { isLabAdmin } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/tests/[id]
 * View details of a test, strictly verified to belong to the authenticated laboratory.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req, { params }) => {
    const labId = req.user?.labId || req.user?.id;
    if (!labId) {
      return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { id } = await params;
    if (!id) {
      return ApiResponse.error('Test ID is required', 'BAD_REQUEST', [], 400);
    }

    const test = await labTestService.getTestById(labId, id);
    if (!test) {
      return ApiResponse.error('Diagnostic test not found or access denied', 'NOT_FOUND', [], 404);
    }

    return ApiResponse.success({ test }, 'Diagnostic test details retrieved');
  })
);

/**
 * PUT/PATCH /api/v1/lab/tests/[id]
 * Update a test or toggle its status (activate/deactivate) - Lab Admin only.
 */
async function handleUpdate(req, { params }) {
  const labId = req.user?.labId || req.user?.id;
  if (!labId) {
    return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
  }

  if (!isLabAdmin(req.user)) {
    return ApiResponse.error('Access Denied: Technicians and Pathologists have view-only access to the test catalog.', 'FORBIDDEN', [], 403);
  }

  const { id } = await params;
  if (!id) {
    return ApiResponse.error('Test ID is required', 'BAD_REQUEST', [], 400);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
  }

  try {
    const updatedTest = await labTestService.updateTest(labId, id, body);
    return ApiResponse.success({ test: updatedTest }, 'Diagnostic test updated successfully');
  } catch (err) {
    if (err.code === 'DUPLICATE_CODE') {
      return ApiResponse.error(err.message, 'DUPLICATE_CODE', [], 409);
    }
    if (err.status === 404) {
      return ApiResponse.error(err.message || 'Diagnostic test not found', 'NOT_FOUND', [], 404);
    }
    return ApiResponse.error(err.message || 'Failed to update diagnostic test', 'UPDATE_FAILED', [], 400);
  }
}

export const PUT = withErrorHandler(withRoles(['lab', 'admin'], handleUpdate));
export const PATCH = withErrorHandler(withRoles(['lab', 'admin'], handleUpdate));
