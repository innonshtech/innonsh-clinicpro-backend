import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * POST /api/v1/lab/samples/collect
 * Record sample collection for an accepted order.
 */
export const POST = withErrorHandler(
  withRoles(['lab', 'admin'], async (req) => {
    const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
    if (!labId) {
      return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
    }

    let body;
    try {
      body = await req.json();
    } catch (e) {
      return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
    }

    try {
      const sample = await labSampleService.collectSample(labId, body, req.user);
      return ApiResponse.success({ sample }, 'Sample collected and barcode generated successfully', 201);
    } catch (err) {
      const statusCode = err.status || 400;
      return ApiResponse.error(err.message || 'Failed to collect sample', 'COLLECTION_FAILED', [], statusCode);
    }
  })
);
