import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * PUT/PATCH /api/v1/lab/samples/[id]/receive
 * Mark a sample as received at the laboratory bench.
 */
async function handleReceive(req, { params }) {
  const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
  if (!labId) {
    return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
  }

  const { id } = await params;
  if (!id) {
    return ApiResponse.error('Sample ID is required', 'BAD_REQUEST', [], 400);
  }

  let body = {};
  try {
    body = await req.json();
  } catch (e) {
    // Body is optional
  }

  try {
    const updatedSample = await labSampleService.receiveSample(labId, id, body, req.user);
    return ApiResponse.success({ sample: updatedSample }, 'Sample received and checked in at bench successfully');
  } catch (err) {
    const statusCode = err.status || 400;
    return ApiResponse.error(err.message || 'Failed to receive sample', 'RECEIVE_FAILED', [], statusCode);
  }
}

export const PUT = withErrorHandler(withRoles(['lab', 'admin'], handleReceive));
export const PATCH = withErrorHandler(withRoles(['lab', 'admin'], handleReceive));
