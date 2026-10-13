import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { withRoles } from '@/utils/authGuard';
import { labSampleService } from '@/services/labSampleService';

/**
 * PUT/PATCH /api/v1/lab/samples/[id]/reject
 * Reject a sample due to specimen/quality failure.
 */
async function handleReject(req, { params }) {
  const labId = req.user?.labId || (req.user?.role === 'lab' ? req.user?.id : null);
  if (!labId) {
    return ApiResponse.error('Unauthorized: Laboratory identifier missing', 'UNAUTHORIZED', [], 401);
  }

  const { id } = await params;
  if (!id) {
    return ApiResponse.error('Sample ID is required', 'BAD_REQUEST', [], 400);
  }

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return ApiResponse.error('Invalid JSON body', 'BAD_REQUEST', [], 400);
  }

  const { rejection_reason } = body;
  if (!rejection_reason || !rejection_reason.trim()) {
    return ApiResponse.error('Rejection reason is mandatory when rejecting a sample', 'VALIDATION_ERROR', [], 400);
  }

  try {
    const updatedSample = await labSampleService.rejectSample(labId, id, body, req.user);
    return ApiResponse.success({ sample: updatedSample }, 'Sample rejected successfully');
  } catch (err) {
    const statusCode = err.status || 400;
    return ApiResponse.error(err.message || 'Failed to reject sample', 'REJECTION_FAILED', [], statusCode);
  }
}

export const PUT = withErrorHandler(withRoles(['lab', 'admin'], handleReject));
export const PATCH = withErrorHandler(withRoles(['lab', 'admin'], handleReject));
