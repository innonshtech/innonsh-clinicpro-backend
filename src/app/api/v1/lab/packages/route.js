import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labPackageService } from '@/services/labPackageService';
import { isLabAdmin } from '@/constants/labRoles';

/**
 * GET /api/v1/lab/packages
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

    const packages = await labPackageService.listPackages(labId, { search, status });
    return ApiResponse.success({ packages }, 'Packages retrieved successfully');
  })
);

/**
 * POST /api/v1/lab/packages
 * Creates a new test package for the authenticated laboratory (Lab Admin only).
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || req.user?.id;
    if (!labId) {
      return ApiResponse.error('Unauthorized: Lab identifier missing', 'UNAUTHORIZED', [], 401);
    }

    if (!isLabAdmin(req.user)) {
      return ApiResponse.error('Access Denied: Technicians and Pathologists have view-only access to test packages.', 'FORBIDDEN', [], 403);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    try {
      const pkg = await labPackageService.createPackage(labId, body);
      return ApiResponse.success({ package: pkg }, 'Test package created successfully', 201);
    } catch (err) {
      if (err.code === 'DUPLICATE_CODE') {
        return ApiResponse.error(err.message, 'DUPLICATE_CODE', [], 409);
      }
      if (err.code === 'INVALID_TEST_SELECTION' || err.status === 403) {
        return ApiResponse.error(err.message, 'INVALID_TEST_SELECTION', [], 403);
      }
      return ApiResponse.error(err.message || 'Failed to create test package', 'CREATION_FAILED', [], 400);
    }
  })
);
