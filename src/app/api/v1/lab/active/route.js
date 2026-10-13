import { ApiResponse } from '@/utils/apiResponse';
import { withErrorHandler } from '@/utils/apiHandler';
import { labOrderService } from '@/services/labOrderService';

export const GET = withErrorHandler(async () => {
  const labs = await labOrderService.listActiveLabs();
  return ApiResponse.success({ labs }, 'Active laboratories retrieved successfully');
});
