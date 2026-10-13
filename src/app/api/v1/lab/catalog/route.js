import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { labOrderService } from '@/services/labOrderService';

export const GET = withErrorHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const labId = searchParams.get('labId');
  if (!labId) {
    return ApiResponse.error('labId query parameter is required', 'BAD_REQUEST', [], 400);
  }
  const catalog = await labOrderService.getLabServices(labId);
  return ApiResponse.success(catalog, 'Laboratory services retrieved successfully');
});
