import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labTestService } from '@/services/labTestService';
import { isLabAdmin } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/tests
 * Scoped strictly to the authenticated laboratory.
 */
export const GET = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || req.user?.id;
    if (!labId) {
      return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || '';
    const status = searchParams.get('status') || 'all';
    const department = searchParams.get('department') || 'all';

    const tests = await labTestService.listTests(labId, { search, status, department });
    return ApiResponse.success({ tests }, 'Tests retrieved successfully');
  })
);

/**
 * POST /api/v1/lab/tests
 * Creates a new test in the laboratory catalog (Lab Admin only).
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || req.user?.id;
    if (!labId) {
      return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
    }

    if (!isLabAdmin(req.user)) {
      return ApiResponse.error('Access Denied: Technicians and Pathologists have view-only access to the test catalog.', 'FORBIDDEN', [], 403);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    try {
      const test = await labTestService.createTest(labId, body);
      return ApiResponse.success({ test }, 'Diagnostic test created successfully', 201);
    } catch (err) {
      if (err.code === 'DUPLICATE_CODE') {
        return ApiResponse.error(err.message, 'DUPLICATE_CODE', [], 409);
      }
      return ApiResponse.error(err.message || 'Failed to create diagnostic test', 'CREATION_FAILED', [], 400);
    }
  })
);
